const router = require('express').Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendSms } = require('../lib/sms');
const config = require('../config');
const rl = require('../lib/ratelimit');
const asyncHandler = require('../lib/asyncHandler');
const { normalisePhone, isValidPhone } = require('../lib/validate');

const TTL_MIN = config.OTP_TTL_MINUTES;

// POST /auth/otp/send  { phone }
// Rate limited by IP and by phone, with a per-phone cooldown between sends.
router.post('/otp/send', asyncHandler(async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'bad_phone' });

  const ip = rl.clientIp(req);

  // 1) Per-IP limit — stops one host from spraying OTPs to many numbers.
  const ipCheck = await rl.enforce('otp_send_ip', ip, config.rate.otpSendPerIp, config.rate.otpSendPerIpWin);
  if (!ipCheck.allowed) return res.status(429).json({ error: 'rate_limited', scope: 'ip' });

  // 2) Per-phone cooldown — a minimum gap between codes to one number.
  const since = await rl.secondsSinceLast('otp_send_phone', phone);
  if (since !== null && since < config.rate.otpSendCooldownSec) {
    return res.status(429).json({ error: 'cooldown', retry_after_sec: config.rate.otpSendCooldownSec - since });
  }

  // 3) Per-phone window limit — caps total codes to a number per window.
  const phoneCheck = await rl.enforce('otp_send_phone', phone, config.rate.otpSendPerPhone, config.rate.otpSendPerPhoneWin);
  if (!phoneCheck.allowed) return res.status(429).json({ error: 'rate_limited', scope: 'phone' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + TTL_MIN * 60 * 1000);

  await db.query(
    'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1,$2,$3)',
    [phone, code, expires]
  );

  try {
    await sendSms(phone, `${code} is your MMR MaterialX OTP. Valid ${TTL_MIN} min.`);
  } catch (e) {
    // Never log the code; log only that sending failed.
    console.error('[auth] sms send failed');
    return res.status(502).json({ error: 'sms_failed' });
  }

  res.json({ ok: true });
}));

// POST /auth/otp/verify  { phone, code }  -> { token, user }
// Brute-force hardened: a per-phone verify limit that CANNOT be reset by
// requesting a fresh OTP, plus a per-code attempt cap.
router.post('/otp/verify', asyncHandler(async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  const code = String(req.body.code || '');

  if (!isValidPhone(phone)) return res.status(400).json({ error: 'bad_phone' });
  if (!/^\d{4,8}$/.test(code)) return res.status(400).json({ error: 'bad_code' });

  // Per-phone verify limit across ALL codes for this number in the window.
  // Requesting a new OTP does not clear these events, so old records can't be
  // used to get extra guesses.
  const vcheck = await rl.enforce('otp_verify_phone', phone, config.rate.otpVerifyPerPhone, config.rate.otpVerifyWin);
  if (!vcheck.allowed) return res.status(429).json({ error: 'rate_limited', scope: 'verify' });

  // Latest live (unconsumed, unexpired, under per-code attempt cap) code.
  const { rows } = await db.query(
    `SELECT id, code, attempts FROM otp_codes
      WHERE phone=$1 AND consumed=FALSE AND expires_at > now()
        AND attempts < $2
      ORDER BY id DESC LIMIT 1`,
    [phone, config.rate.otpMaxAttempts]
  );
  if (!rows.length) return res.status(401).json({ error: 'invalid_otp' });

  const row = rows[0];
  if (row.code !== code) {
    // Wrong guess: increment the per-code attempt counter; consume if capped.
    await db.query(
      `UPDATE otp_codes SET attempts = attempts + 1,
         consumed = (attempts + 1 >= $2)
       WHERE id=$1`,
      [row.id, config.rate.otpMaxAttempts]
    );
    return res.status(401).json({ error: 'invalid_otp' });
  }

  // Correct code: consume it (one-time use).
  await db.query('UPDATE otp_codes SET consumed=TRUE WHERE id=$1', [row.id]);

  const u = await db.query(
    `INSERT INTO users (phone) VALUES ($1)
      ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
      RETURNING id, phone, name, business_name, latitude, longitude, hub_name, created_at`,
    [phone]
  );
  const user = u.rows[0];
  const token = jwt.sign({ uid: user.id }, config.JWT_SECRET, { expiresIn: config.JWT_TTL });
  res.json({ token, user });
}));

module.exports = router;
