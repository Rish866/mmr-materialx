const router = require('express').Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendSms } = require('../lib/sms');

const TTL_MIN = parseInt(process.env.OTP_TTL_MINUTES || '5', 10);

// Normalise an Indian mobile number to bare digits (E.164 without '+').
function normalisePhone(raw) {
  let p = String(raw || '').replace(/[^\d]/g, '');
  if (p.length === 10) p = '91' + p;          // add India country code
  return p;
}

// POST /auth/otp/send  { phone }
router.post('/otp/send', async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  if (!/^\d{12,15}$/.test(phone)) return res.status(400).json({ error: 'bad_phone' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + TTL_MIN * 60 * 1000);

  await db.query(
    'INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1,$2,$3)',
    [phone, code, expires]
  );

  try {
    await sendSms(phone, `${code} is your MMR MaterialX OTP. Valid ${TTL_MIN} min.`);
  } catch (e) {
    console.error('[auth] sms send failed:', e.message);
    return res.status(502).json({ error: 'sms_failed' });
  }

  res.json({ ok: true });
});

// POST /auth/otp/verify  { phone, code }  -> { token, user }
router.post('/otp/verify', async (req, res) => {
  const phone = normalisePhone(req.body.phone);
  const code = String(req.body.code || '');

  const { rows } = await db.query(
    `SELECT id FROM otp_codes
      WHERE phone=$1 AND code=$2 AND consumed=FALSE AND expires_at > now()
      ORDER BY id DESC LIMIT 1`,
    [phone, code]
  );
  if (!rows.length) return res.status(401).json({ error: 'invalid_otp' });

  await db.query('UPDATE otp_codes SET consumed=TRUE WHERE id=$1', [rows[0].id]);

  const u = await db.query(
    `INSERT INTO users (phone) VALUES ($1)
      ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
      RETURNING id, phone, name, business_name, latitude, longitude, hub_name, created_at`,
    [phone]
  );
  const user = u.rows[0];
  const token = jwt.sign({ uid: user.id }, process.env.JWT_SECRET, { expiresIn: '90d' });
  res.json({ token, user });
});

module.exports = router;
