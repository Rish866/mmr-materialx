const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const config = require('../src/config');

test.before(async () => {
  await h.applyMigrations();
  await h.startServer();
});
test.after(async () => { await h.stopServer(); });
test.beforeEach(async () => { await h.resetData(); });

// Push N rate_events for a bucket/key so the next request is at/over the limit.
async function fillRateEvents(bucket, key, n) {
  const c = await h.dbClient();
  for (let i = 0; i < n; i++) {
    await c.query('INSERT INTO rate_events (bucket, key) VALUES ($1,$2)', [bucket, key]);
  }
}

// The shared test harness RELAXES limits so fixtures aren't throttled. These
// security tests temporarily tighten a specific limit on the live config
// object (restored in finally) so we can prove enforcement deterministically
// with only a handful of seeded events.
async function withLimit(field, value, fn) {
  const prev = config.rate[field];
  config.rate[field] = value;
  try { await fn(); } finally { config.rate[field] = prev; }
}

// ---------------- OTP send rate limiting ----------------

test('OTP send is blocked once the per-phone send limit is reached', async () => {
  await withLimit('otpSendPerPhone', 3, async () => {
    const phone = '9811100001';
    const norm = '91' + phone;
    await fillRateEvents('otp_send_phone', norm, 3); // at the limit
    const { status, body } = await h.http('POST', '/auth/otp/send', { body: { phone } });
    assert.equal(status, 429);
    assert.equal(body.error, 'rate_limited');
    assert.equal(body.scope, 'phone');
  });
});

test('OTP send is blocked once the per-IP send limit is reached', async () => {
  await withLimit('otpSendPerIp', 3, async () => {
    // First send records one event under the server's actual IP key (which may
    // be ::1 / ::ffff:127.0.0.1 depending on the stack). Read it back, then top
    // the bucket up to the limit so the next send is rejected.
    await h.http('POST', '/auth/otp/send', { body: { phone: '9811100002' } });
    const c = await h.dbClient();
    const { rows } = await c.query("SELECT key FROM rate_events WHERE bucket='otp_send_ip' LIMIT 1");
    const ipKey = rows[0].key;
    await fillRateEvents('otp_send_ip', ipKey, 3); // now over the limit of 3
    const { status, body } = await h.http('POST', '/auth/otp/send', { body: { phone: '9811100003' } });
    assert.equal(status, 429);
    assert.equal(body.error, 'rate_limited');
    assert.equal(body.scope, 'ip');
  });
});

test('OTP send cooldown blocks a second send within the cooldown window', async () => {
  // Record a recent send event; with a positive cooldown the next send is 429.
  const phone = '9811100003';
  const norm = '91' + phone;
  const prevCooldown = config.rate.otpSendCooldownSec;
  config.rate.otpSendCooldownSec = 60; // force a cooldown for this test
  try {
    await h.http('POST', '/auth/otp/send', { body: { phone } }); // first send ok
    const { status, body } = await h.http('POST', '/auth/otp/send', { body: { phone } });
    assert.equal(status, 429);
    assert.equal(body.error, 'cooldown');
    assert.ok(body.retry_after_sec > 0);
  } finally {
    config.rate.otpSendCooldownSec = prevCooldown;
  }
});

test('OTP send rejects an invalid phone (400) before any rate work', async () => {
  const { status, body } = await h.http('POST', '/auth/otp/send', { body: { phone: '123' } });
  assert.equal(status, 400);
  assert.equal(body.error, 'bad_phone');
});

// ---------------- OTP verify brute-force protection ----------------

test('a single OTP code locks after the per-code attempt cap is exceeded', async () => {
  const phone = '9811100010';
  const norm = '91' + phone;
  // Create a known code directly.
  const c = await h.dbClient();
  await c.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1,'654321', now() + interval '5 min')",
    [norm]
  );
  // Make wrong guesses up to the cap.
  for (let i = 0; i < config.rate.otpMaxAttempts; i++) {
    const r = await h.http('POST', '/auth/otp/verify', { body: { phone, code: '000000' } });
    assert.equal(r.status, 401);
  }
  // Even the CORRECT code now fails — the row was consumed after the cap.
  const final = await h.http('POST', '/auth/otp/verify', { body: { phone, code: '654321' } });
  assert.equal(final.status, 401, 'correct code rejected after attempt cap — code is locked');
});

test('requesting a NEW otp does not reset the per-phone verify limit (old records cannot bypass)', async () => {
  await withLimit('otpVerifyPerPhone', 4, async () => {
    const phone = '9811100011';
    const norm = '91' + phone;
    // Fill the per-phone verify bucket to its (tightened) max.
    await fillRateEvents('otp_verify_phone', norm, 4);
    // A brand-new, valid OTP exists...
    const c = await h.dbClient();
    await c.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1,'111222', now() + interval '5 min')",
      [norm]
    );
    // ...but verify is still blocked because the per-phone limit is independent
    // of any single code (old records cannot buy extra guesses).
    const { status, body } = await h.http('POST', '/auth/otp/verify', { body: { phone, code: '111222' } });
    assert.equal(status, 429);
    assert.equal(body.scope, 'verify');
  });
});

test('verify rejects a malformed code (400)', async () => {
  const { status, body } = await h.http('POST', '/auth/otp/verify', { body: { phone: '9811100012', code: 'abcd' } });
  assert.equal(status, 400);
  assert.equal(body.error, 'bad_code');
});

test('expired OTP cannot be verified', async () => {
  const phone = '9811100013';
  const norm = '91' + phone;
  const c = await h.dbClient();
  await c.query(
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1,'222333', now() - interval '1 min')",
    [norm]
  );
  const { status } = await h.http('POST', '/auth/otp/verify', { body: { phone, code: '222333' } });
  assert.equal(status, 401);
});

// ---------------- security headers + CORS ----------------

test('security headers are present on responses', async () => {
  const { headers } = await h.http('GET', '/health');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.ok(headers['content-security-policy']);
  assert.equal(headers['x-powered-by'], undefined, 'framework not advertised');
});

// ---------------- input validation on listings ----------------

test('create listing rejects an unsafe (non-https) photo URL', async () => {
  const { token } = await h.loginViaOtp('9811100020');
  const { status, body } = await h.http('POST', '/listings', {
    token,
    body: {
      title: 'X', category_id: 1, latitude: 19.1, longitude: 73.0,
      photos: ['javascript:alert(1)'],
    },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_photo_url');
});

test('create listing rejects out-of-range coordinates', async () => {
  const { token } = await h.loginViaOtp('9811100021');
  const { status, body } = await h.http('POST', '/listings', {
    token, body: { title: 'X', category_id: 1, latitude: 999, longitude: 73.0 },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_location');
});

test('create listing rejects a negative price', async () => {
  const { token } = await h.loginViaOtp('9811100022');
  const { status, body } = await h.http('POST', '/listings', {
    token, body: { title: 'X', category_id: 1, latitude: 19.1, longitude: 73.0, price: -5 },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_price');
});

test('create listing rejects more than 4 photos', async () => {
  const { token } = await h.loginViaOtp('9811100023');
  const { status, body } = await h.http('POST', '/listings', {
    token,
    body: {
      title: 'X', category_id: 1, latitude: 19.1, longitude: 73.0,
      photos: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg', 'https://a/4.jpg', 'https://a/5.jpg'],
    },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'too_many_photos');
});

// ---------------- malformed JSON + error handling ----------------

test('malformed JSON body returns 400 invalid_json (not a 500)', async () => {
  const { status, body } = await h.httpRaw('POST', '/auth/otp/send', '{ not json');
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_json');
});

// ---------------- upload signing never leaks secrets ----------------

test('upload sign (local) returns no secret material', async () => {
  const { token } = await h.loginViaOtp('9811100030');
  const { status, body } = await h.http('POST', '/uploads/sign', { token, body: { fileName: 'a.jpg' } });
  assert.equal(status, 200);
  const s = JSON.stringify(body);
  assert.ok(!/secret/i.test(s), 'no secret in response');
});

// ---------------- resilience: DB error -> clean 500, no crash ----------------

test('a database error inside a route returns a generic 500 (process does not crash)', async () => {
  // Temporarily break a table so the categories query throws.
  const c = await h.dbClient();
  await c.query('ALTER TABLE categories RENAME TO categories_tmp');
  try {
    const { status, body } = await h.http('GET', '/categories');
    assert.equal(status, 500);
    assert.equal(body.error, 'server_error', 'generic message, no internals leaked');
  } finally {
    await c.query('ALTER TABLE categories_tmp RENAME TO categories');
  }
  // The server is still alive and serving requests afterwards.
  const health = await h.http('GET', '/health');
  assert.equal(health.status, 200);
});

// ---------------- WhatsApp URL safety (no raw injection) ----------------

test('WhatsApp URL from interest is fully URL-encoded even with hostile titles', async () => {
  const { token: seller } = await h.loginViaOtp('9811100040'); // user 1
  const { token: buyer } = await h.loginViaOtp('9811100041');  // user 2
  const l = await h.seedListing({ user_id: 1, title: 'Evil " & ?text=x https://evil', price: 100 });
  const { status, body } = await h.http('POST', `/listings/${l.id}/interest`, { token: buyer, body: {} });
  assert.equal(status, 200);
  assert.ok(body.whatsapp_url.startsWith('https://wa.me/'));
  // No raw quote/space/newline leaked into the URL (all percent-encoded).
  const afterText = body.whatsapp_url.split('?text=')[1] || '';
  assert.ok(!/[\s"]/.test(afterText), 'message is percent-encoded');
});

test('interest rejects a non-numeric offer (400)', async () => {
  const { token: buyer } = await h.loginViaOtp('9811100042');
  const l = await h.seedListing({ user_id: 1 });
  const { status } = await h.http('POST', `/listings/${l.id}/interest`, { token: buyer, body: { offer_price: 'lots' } });
  assert.equal(status, 400);
});
