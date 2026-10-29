/**
 * SMS abstraction.
 *
 * - console provider: prints the OTP to the server log for local development
 *   ONLY. It is refused in production (config.js blocks SMS_PROVIDER=console
 *   when NODE_ENV=production), so a real code can never be written to prod logs.
 * - msg91 provider: sends via MSG91 (India, DLT compliant).
 *
 * Security: we never log the OTP code outside the explicit dev console path.
 */
const config = require('../config');

async function sendViaConsole(phone, message) {
  // Dev convenience only. Guarded so it never runs in production.
  if (config.isProd) throw new Error('console_sms_not_allowed_in_production');
  // Mask the middle of the phone number even in dev logs.
  console.log(`\n========= [DEV SMS] =========\nto:   +${maskPhone(phone)}\nbody: ${message}\n=============================\n`);
  return { ok: true, provider: 'console' };
}

function maskPhone(phone) {
  const p = String(phone);
  if (p.length < 6) return '***';
  return p.slice(0, 2) + '*'.repeat(p.length - 4) + p.slice(-2);
}

async function sendViaMsg91(phone, message) {
  const { MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_DLT_TEMPLATE_ID } = process.env;
  if (!MSG91_AUTH_KEY) throw new Error('MSG91_AUTH_KEY not configured');

  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: MSG91_AUTH_KEY },
    body: JSON.stringify({
      template_id: MSG91_DLT_TEMPLATE_ID,
      sender: MSG91_SENDER_ID,
      short_url: '0',
      recipients: [{ mobiles: phone, OTP: message.match(/\d{4,8}/)?.[0] || '' }],
    }),
  });
  if (!res.ok) {
    // Do not echo the response body wholesale (may contain request details);
    // log only the status code.
    throw new Error(`msg91_send_failed_${res.status}`);
  }
  return { ok: true, provider: 'msg91' };
}

async function sendSms(phone, message) {
  if (config.SMS_PROVIDER === 'msg91') return sendViaMsg91(phone, message);
  return sendViaConsole(phone, message);
}

module.exports = { sendSms, maskPhone };
