const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

test.before(async () => {
  await h.applyMigrations();
  await h.startServer();
});
test.after(async () => { await h.stopServer(); });
test.beforeEach(async () => { await h.resetData(); });

test('GET /health returns ok', async () => {
  const { status, body } = await h.http('GET', '/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'mmr-materialx');
});

test('unknown route returns 404', async () => {
  const { status } = await h.http('GET', '/this-route-does-not-exist');
  assert.equal(status, 404);
});

test('GET /categories returns the 6 seeded categories in order', async () => {
  const { status, body } = await h.http('GET', '/categories');
  assert.equal(status, 200);
  assert.equal(body.length, 6);
  assert.equal(body[0].slug, 'paints');          // sort_order 1
  assert.equal(body[body.length - 1].slug, 'other'); // sort_order 99
  for (const c of body) {
    assert.ok(c.id && c.name && c.slug, 'each category has id/name/slug');
  }
});

test('GET /me requires auth', async () => {
  const { status, body } = await h.http('GET', '/me');
  assert.equal(status, 401);
  assert.equal(body.error, 'no_token');
});

test('GET /me returns the current profile', async () => {
  const { token, user } = await h.loginViaOtp('9811111111');
  const { status, body } = await h.http('GET', '/me', { token });
  assert.equal(status, 200);
  assert.equal(body.id, user.id);
  assert.equal(body.phone, '919811111111');
});

test('PATCH /me updates the profile fields', async () => {
  const { token } = await h.loginViaOtp('9811111111');
  const { status, body } = await h.http('PATCH', '/me', {
    token,
    body: { name: 'Rajesh', business_name: 'Sharma Industries', hub_name: 'Rabale' },
  });
  assert.equal(status, 200);
  assert.equal(body.name, 'Rajesh');
  assert.equal(body.business_name, 'Sharma Industries');
  assert.equal(body.hub_name, 'Rabale');
});

test('PATCH /me with partial body keeps existing values (COALESCE)', async () => {
  const { token } = await h.loginViaOtp('9811111111');
  await h.http('PATCH', '/me', { token, body: { name: 'First', business_name: 'Co' } });
  const { body } = await h.http('PATCH', '/me', { token, body: { name: 'Second' } });
  assert.equal(body.name, 'Second');
  assert.equal(body.business_name, 'Co', 'unspecified field preserved');
});
