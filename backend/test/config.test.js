const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

// Load src/config.js in a CHILD process with a given env and return
// { ok, stderr }. ok=false means the module threw (process exited non-zero),
// which is the intended "refuse to start" behaviour in production.
function loadConfigWith(env) {
  const configPath = path.join(__dirname, '..', 'src', 'config.js');
  try {
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
      env: { PATH: process.env.PATH, ...env },
      stdio: 'pipe',
    });
    return { ok: true, stderr: '' };
  } catch (e) {
    return { ok: false, stderr: (e.stderr || Buffer.from('')).toString() };
  }
}

test('production REFUSES to start without a JWT secret', () => {
  const r = loadConfigWith({ NODE_ENV: 'production', SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'x', UPLOAD_PROVIDER: 'cloudinary' });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /JWT_SECRET is required/);
});

test('production REFUSES a weak/default JWT secret', () => {
  const r = loadConfigWith({
    NODE_ENV: 'production',
    JWT_SECRET: 'change-me-to-a-long-random-string',
    SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'x', UPLOAD_PROVIDER: 'cloudinary',
  });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /weak|default/i);
});

test('production REFUSES a too-short JWT secret', () => {
  const r = loadConfigWith({
    NODE_ENV: 'production', JWT_SECRET: 'short',
    SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'x', UPLOAD_PROVIDER: 'cloudinary',
  });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /at least 32 characters/);
});

test('production REFUSES console SMS provider', () => {
  const r = loadConfigWith({
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(48),
    SMS_PROVIDER: 'console', UPLOAD_PROVIDER: 'cloudinary',
  });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /SMS_PROVIDER must be a real provider/);
});

test('production REFUSES msg91 without an auth key', () => {
  const r = loadConfigWith({
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(48),
    SMS_PROVIDER: 'msg91', UPLOAD_PROVIDER: 'cloudinary',
  });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /MSG91_AUTH_KEY is required/);
});

test('production REFUSES local upload provider', () => {
  const r = loadConfigWith({
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(48),
    SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'x', UPLOAD_PROVIDER: 'local',
  });
  assert.equal(r.ok, false);
  assert.match(r.stderr, /UPLOAD_PROVIDER must be a real provider/);
});

test('production STARTS with a strong, complete config', () => {
  const r = loadConfigWith({
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(48),
    SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'realkey',
    UPLOAD_PROVIDER: 'cloudinary',
  });
  assert.equal(r.ok, true, r.stderr);
});

test('development allows convenient defaults (no throw)', () => {
  const r = loadConfigWith({ NODE_ENV: 'development' });
  assert.equal(r.ok, true, r.stderr);
});
