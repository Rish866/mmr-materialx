const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

test.before(async () => {
  await h.applyMigrations();
  await h.startServer();
});
test.after(async () => { await h.stopServer(); });
test.beforeEach(async () => { await h.resetData(); });

test('POST /auth/otp/send rejects a bad phone', async () => {
  const { status, body } = await h.http('POST', '/auth/otp/send', { body: { phone: '123' } });
  assert.equal(status, 400);
  assert.equal(body.error, 'bad_phone');
});

test('POST /auth/otp/send accepts a 10-digit number and stores an OTP', async () => {
  const { status, body } = await h.http('POST', '/auth/otp/send', { body: { phone: '9876543210' } });
  assert.equal(status, 200);
  assert.equal(body.ok, true);

  const client = await h.dbClient();
  const { rows } = await client.query("SELECT phone, code, consumed FROM otp_codes WHERE phone='919876543210'");
  assert.equal(rows.length, 1);
  assert.match(rows[0].code, /^\d{6}$/);
  assert.equal(rows[0].consumed, false);
});

test('POST /auth/otp/verify with the correct code returns a token + user, and consumes the OTP', async () => {
  const result = await h.loginViaOtp('9876543210');
  assert.ok(result.token, 'should return a JWT');
  assert.ok(result.user && result.user.id, 'should return the user');
  assert.equal(result.user.phone, '919876543210');

  // OTP must now be consumed (single-use)
  const client = await h.dbClient();
  const { rows } = await client.query("SELECT consumed FROM otp_codes WHERE phone='919876543210'");
  assert.equal(rows[0].consumed, true);
});

test('POST /auth/otp/verify with a wrong code is rejected 401', async () => {
  await h.http('POST', '/auth/otp/send', { body: { phone: '9876543210' } });
  const { status, body } = await h.http('POST', '/auth/otp/verify', { body: { phone: '9876543210', code: '000000' } });
  assert.equal(status, 401);
  assert.equal(body.error, 'invalid_otp');
});

test('POST /auth/otp/verify rejects an EXPIRED otp 401', async () => {
  // Insert an already-expired code directly.
  const client = await h.dbClient();
  await client.query(
    "INSERT INTO otp_codes (phone, code, expires_at, consumed) VALUES ('919876543210','111111', now() - interval '1 minute', false)"
  );
  const { status, body } = await h.http('POST', '/auth/otp/verify', { body: { phone: '9876543210', code: '111111' } });
  assert.equal(status, 401);
  assert.equal(body.error, 'invalid_otp');
});

test('an OTP cannot be reused after it is consumed', async () => {
  await h.http('POST', '/auth/otp/send', { body: { phone: '9876543210' } });
  const client = await h.dbClient();
  const { rows } = await client.query("SELECT code FROM otp_codes WHERE phone='919876543210' ORDER BY id DESC LIMIT 1");
  const code = rows[0].code;

  const first = await h.http('POST', '/auth/otp/verify', { body: { phone: '9876543210', code } });
  assert.equal(first.status, 200);
  const second = await h.http('POST', '/auth/otp/verify', { body: { phone: '9876543210', code } });
  assert.equal(second.status, 401, 'second use of the same code must fail');
});

test('logging in twice with the same phone returns the SAME user id (upsert)', async () => {
  const a = await h.loginViaOtp('9876543210');
  const b = await h.loginViaOtp('9876543210');
  assert.equal(a.user.id, b.user.id);
});
