/**
 * Shared test harness for the MMR MaterialX API.
 *
 * - Connects to a dedicated TEST Postgres database (TEST_DATABASE_URL or
 *   DATABASE_URL). NEVER point this at production or ordinary dev data: the
 *   helpers TRUNCATE tables between tests.
 * - Applies the real migration (backend/migrations/*.sql) once.
 * - Boots the real Express app on an ephemeral port and returns a base URL.
 * - Forces safe test-only providers: SMS_PROVIDER=console, UPLOAD_PROVIDER=local
 *   so no SMS is sent, no cloud upload happens, and no money is spent.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

// --- force safe, deterministic test environment BEFORE requiring app code ---
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.SMS_PROVIDER = 'console';
process.env.UPLOAD_PROVIDER = process.env.UPLOAD_PROVIDER || 'local';
process.env.PGSSL = process.env.PGSSL || 'disable';
process.env.OTP_TTL_MINUTES = process.env.OTP_TTL_MINUTES || '5';
// Relax rate limits for the GENERAL test suite so legitimate repeated logins in
// fixtures aren't throttled. The dedicated security tests (security.test.js)
// exercise the limits directly with their own strict values. These only take
// effect because config.js reads them at module load in the test process.
process.env.RL_OTP_SEND_COOLDOWN_SEC = process.env.RL_OTP_SEND_COOLDOWN_SEC || '0';
process.env.RL_OTP_SEND_IP_MAX = process.env.RL_OTP_SEND_IP_MAX || '100000';
process.env.RL_OTP_SEND_PHONE_MAX = process.env.RL_OTP_SEND_PHONE_MAX || '100000';
process.env.RL_OTP_VERIFY_PHONE_MAX = process.env.RL_OTP_VERIFY_PHONE_MAX || '100000';

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!TEST_DB_URL) {
  throw new Error(
    'TEST_DATABASE_URL (or DATABASE_URL) must be set to a DEDICATED test database.'
  );
}
// src/db.js reads DATABASE_URL — make sure the app pool uses the test DB.
process.env.DATABASE_URL = TEST_DB_URL;

const MIGRATION_DIR = path.join(__dirname, '..', 'migrations');

// A single long-lived client shared across the suite (tests run serially via
// --test-concurrency=1), so we avoid reconnecting on every assertion.
let shared;
async function sharedClient() {
  if (!shared) {
    shared = new Client({ connectionString: TEST_DB_URL, ssl: false });
    await shared.connect();
  }
  return shared;
}

let migrated = false;
async function applyMigrations() {
  if (migrated) return;            // idempotent within a process
  const client = await sharedClient();
  const files = fs.readdirSync(MIGRATION_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATION_DIR, f), 'utf8');
    await client.query(sql);
  }
  migrated = true;
}

// Remove all rows but keep schema + seeded categories. Deterministic per-test.
async function resetData() {
  const client = await sharedClient();
  // RESTART IDENTITY so ids are stable across tests; CASCADE for FKs.
  await client.query(
    'TRUNCATE deal_interests, listings, otp_codes, users, rate_events RESTART IDENTITY CASCADE'
  );
}

// Returns the shared client for direct assertions / fixture setup in tests.
// (Callers must NOT call .end() on it.)
async function dbClient() {
  return sharedClient();
}

// Boot the real app on an ephemeral port.
let server;
let baseUrl;
async function startServer() {
  if (server) return baseUrl;      // idempotent across test files in one process
  // require AFTER env is set so the pool binds to the test DB.
  const app = require('../src/server');
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
  return baseUrl;
}

// Per-file teardown is a NO-OP: the HTTP server, shared pg client, and the app
// pool are long-lived singletons reused across all test files in the process.
// We rely on `--test-force-exit` to terminate the process once every file has
// finished. (Closing them per-file would break subsequently-run files.)
async function stopServer() { /* intentionally empty */ }

// Tiny fetch wrapper that returns { status, body }.
async function http(method, pathname, { token, body, raw } = {}) {
  const headers = {};
  if (!raw) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  let parsed;
  try { parsed = await res.json(); } catch { parsed = null; }
  const resHeaders = {};
  res.headers.forEach((val, key) => { resHeaders[key] = val; });
  return { status: res.status, body: parsed, headers: resHeaders };
}

// Send a RAW (possibly malformed) body string and fully consume the response.
async function httpRaw(method, pathname, rawBody, contentType = 'application/json') {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': contentType },
    body: rawBody,
  });
  let parsed;
  try { parsed = await res.json(); } catch { parsed = null; }
  const headers = {};
  res.headers.forEach((val, key) => { headers[key] = val; });
  return { status: res.status, body: parsed, headers };
}

// Mint a JWT for a given user id WITHOUT going through OTP (handy for guards).
function tokenFor(uid) {
  return jwt.sign({ uid }, process.env.JWT_SECRET);
}

// Full OTP login flow -> returns { token, user }. Reads the generated code
// straight from the DB (console SMS provider does not expose it otherwise).
async function loginViaOtp(phone = '9876500000') {
  await http('POST', '/auth/otp/send', { body: { phone } });
  const client = await dbClient();
  const norm = phone.replace(/\D/g, '').length === 10 ? '91' + phone.replace(/\D/g, '') : phone.replace(/\D/g, '');
  const { rows } = await client.query(
    'SELECT code FROM otp_codes WHERE phone=$1 ORDER BY id DESC LIMIT 1',
    [norm]
  );
  const code = rows[0]?.code;
  const { body } = await http('POST', '/auth/otp/verify', { body: { phone, code } });
  return body;
}

// Seed one category-known listing for a user; returns the listing row.
async function seedListing(overrides = {}) {
  const client = await dbClient();
  const d = {
    user_id: 1, category_id: 1, title: 'Test Material', quantity: 10, unit: 'kg',
    price: 1000, price_type: 'per_unit', is_urgent: false,
    latitude: 19.136, longitude: 73.022, hub_name: 'Rabale', photos: [],
    status: 'active', expires_at: null, ...overrides,
  };
  const { rows } = await client.query(
    `INSERT INTO listings (user_id, category_id, title, quantity, unit, price,
       price_type, is_urgent, latitude, longitude, hub_name, photos, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [d.user_id, d.category_id, d.title, d.quantity, d.unit, d.price, d.price_type,
     d.is_urgent, d.latitude, d.longitude, d.hub_name, d.photos, d.status, d.expires_at]
  );
  return rows[0];
}

module.exports = {
  applyMigrations, resetData, dbClient, startServer, stopServer,
  http, httpRaw, tokenForUid: tokenFor, loginViaOtp, seedListing, TEST_DB_URL,
  _baseUrl: () => baseUrl,
};
