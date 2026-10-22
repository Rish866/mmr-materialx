/**
 * SMS abstraction. In dev (SMS_PROVIDER=console) the OTP is logged to the
 * server console so you can test the full auth flow with zero cost / no DLT.
 * In prod set SMS_PROVIDER=msg91 and fill the MSG91_* env vars.
 */

async function sendViaConsole(phone, message) {
  console.log(`\n========= [DEV SMS] =========\nto:   +${phone}\nbody: ${message}\n=============================\n`);
  return { ok: true, provider: 'console' };
}

async function sendViaMsg91(phone, message) {
  const { MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_DLT_TEMPLATE_ID } = process.env;
  if (!MSG91_AUTH_KEY) throw new Error('MSG91_AUTH_KEY not configured');

  // MSG91 Flow / Send SMS API. Adjust to your approved DLT template.
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: MSG91_AUTH_KEY,
    },
    body: JSON.stringify({
      template_id: MSG91_DLT_TEMPLATE_ID,
      sender: MSG91_SENDER_ID,
      short_url: '0',
      recipients: [{ mobiles: phone, OTP: message.match(/\d{4,6}/)?.[0] || message }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MSG91 send failed: ${res.status} ${body}`);
  }
  return { ok: true, provider: 'msg91' };
}

async function sendSms(phone, message) {
  const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();
  if (provider === 'msg91') return sendViaMsg91(phone, message);
  return sendViaConsole(phone, message);
}

module.exports = { sendSms };
