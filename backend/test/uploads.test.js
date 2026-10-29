const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { cloudinarySignature } = require('../src/lib/uploads');

let token;

test.before(async () => {
  await h.applyMigrations();
  await h.startServer();
});
test.after(async () => {
  await h.stopServer();
  // restore safe default for any later files
  process.env.UPLOAD_PROVIDER = 'local';
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
test.beforeEach(async () => {
  await h.resetData();
  const r = await h.loginViaOtp('9822222222');
  token = r.token;
  // reset provider env each test for isolation
  process.env.UPLOAD_PROVIDER = 'local';
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test('POST /uploads/sign requires auth', async () => {
  const { status } = await h.http('POST', '/uploads/sign', { body: {} });
  assert.equal(status, 401);
});

test('local provider returns a no-op { provider: "local" }', async () => {
  process.env.UPLOAD_PROVIDER = 'local';
  const { status, body } = await h.http('POST', '/uploads/sign', { token, body: { fileName: 'a.jpg' } });
  assert.equal(status, 200);
  assert.equal(body.provider, 'local');
});

test('cloudinary provider returns signed params with a VALID signature', async () => {
  process.env.UPLOAD_PROVIDER = 'cloudinary';
  process.env.CLOUDINARY_CLOUD_NAME = 'demo';
  process.env.CLOUDINARY_API_KEY = '123456';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  const { status, body } = await h.http('POST', '/uploads/sign', { token, body: { fileName: 'b.jpg' } });
  assert.equal(status, 200);
  assert.equal(body.provider, 'cloudinary');
  assert.equal(body.uploadUrl, 'https://api.cloudinary.com/v1_1/demo/image/upload');
  assert.equal(body.params.api_key, '123456');
  assert.equal(body.params.folder, 'mmr-listings');
  assert.equal(body.responseUrlField, 'secure_url');
  assert.ok(body.params.timestamp, 'has timestamp');
  // the signature returned must match what the documented algorithm produces
  const expected = cloudinarySignature(
    { folder: body.params.folder, timestamp: body.params.timestamp },
    'test-secret'
  );
  assert.equal(body.params.signature, expected, 'signature is self-consistent');
  // and the secret must NOT leak into the response
  assert.ok(!JSON.stringify(body).includes('test-secret'), 'api_secret never exposed');
});

test('cloudinary MISCONFIGURED returns 503 cloudinary_not_configured', async () => {
  process.env.UPLOAD_PROVIDER = 'cloudinary';
  // no CLOUDINARY_* vars set
  const { status, body } = await h.http('POST', '/uploads/sign', { token, body: {} });
  assert.equal(status, 503);
  assert.equal(body.error, 'cloudinary_not_configured');
  assert.equal(body.provider, 'cloudinary');
});

test('supabase MISCONFIGURED returns 503 supabase_not_configured', async () => {
  process.env.UPLOAD_PROVIDER = 'supabase';
  // no SUPABASE_* vars set
  const { status, body } = await h.http('POST', '/uploads/sign', { token, body: {} });
  assert.equal(status, 503);
  assert.equal(body.error, 'supabase_not_configured');
});

test('cloudinary signature matches the documented algorithm (unit)', () => {
  // Stable vector: proves the signing function itself, independent of time.
  const sig = cloudinarySignature({ folder: 'mmr-listings', timestamp: 1700000000 }, 'abcd');
  // recompute the exact same way the implementation documents
  const crypto = require('crypto');
  const expected = crypto
    .createHash('sha1')
    .update('folder=mmr-listings&timestamp=1700000000' + 'abcd')
    .digest('hex');
  assert.equal(sig, expected);
});
