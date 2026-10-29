#!/usr/bin/env node
/**
 * Deployment smoke test — verifies a LIVE deployment is healthy.
 *
 * Usage:
 *   SMOKE_BASE_URL=https://your-api.onrender.com npm run smoke
 *
 * It only performs SAFE, read-mostly checks and never mutates real listings:
 *   - GET /health            (liveness)
 *   - GET /health/ready      (DB connectivity)
 *   - GET /categories        (DB read returns the seeded catalog)
 *   - GET /listings?...      (feed query works; requires lat/lng)
 *   - POST /auth/otp/send    (rate-limit + validation path; a REAL OTP is sent
 *                             only if you pass --otp, see below)
 *   - Auth guard             (protected route rejects an anonymous request)
 *
 * Auth note: in production the OTP is delivered by SMS and this script cannot
 * read it. To exercise the full login flow, pass a dedicated TEST phone and the
 * code you received:  SMOKE_BASE_URL=... node scripts/smoke-test.js --phone 9xxxxxxxxx --otp 123456
 * Without --otp the OTP send step is skipped by default to avoid sending SMS /
 * spending money (override with SMOKE_SEND_OTP=yes).
 */

const BASE = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
if (!BASE) {
  console.error('Set SMOKE_BASE_URL to the deployed API base, e.g. https://mmr-materialx-api.onrender.com');
  process.exit(2);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function getJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body };
}

(async () => {
  console.log(`Smoke testing: ${BASE}\n`);

  // 1) liveness
  try {
    const r = await getJson('/health');
    record('GET /health (liveness)', r.status === 200 && r.body && r.body.ok === true, `status ${r.status}`);
  } catch (e) { record('GET /health (liveness)', false, e.message); }

  // 2) readiness / DB connectivity
  try {
    const r = await getJson('/health/ready');
    record('GET /health/ready (database up)', r.status === 200 && r.body && r.body.db === 'up', `status ${r.status}`);
  } catch (e) { record('GET /health/ready (database up)', false, e.message); }

  // 3) categories (seeded DB read)
  try {
    const r = await getJson('/categories');
    const ok = r.status === 200 && Array.isArray(r.body) && r.body.length >= 1;
    record('GET /categories (seeded catalog)', ok, `${Array.isArray(r.body) ? r.body.length : 0} categories`);
  } catch (e) { record('GET /categories', false, e.message); }

  // 4) feed query (uses the Haversine filter; empty result is still a PASS)
  try {
    const r = await getJson('/listings?lat=19.136&lng=73.022&radius_km=25');
    record('GET /listings (feed query works)', r.status === 200 && Array.isArray(r.body), `status ${r.status}`);
  } catch (e) { record('GET /listings', false, e.message); }

  // 5) auth guard — a protected route must reject an anonymous request
  try {
    const r = await getJson('/me');
    record('GET /me without token -> 401 (auth enforced)', r.status === 401, `status ${r.status}`);
  } catch (e) { record('GET /me (auth guard)', false, e.message); }

  // 6) OTP send (OPTIONAL — sends a real SMS in production, so off by default)
  const phone = arg('--phone') || process.env.SMOKE_PHONE;
  const wantSend = process.env.SMOKE_SEND_OTP === 'yes' || !!arg('--otp');
  if (phone && wantSend) {
    try {
      const r = await getJson('/auth/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      });
      record('POST /auth/otp/send (accepted)', r.status === 200, `status ${r.status}`);
    } catch (e) { record('POST /auth/otp/send', false, e.message); }

    // 7) full login only if an OTP code was supplied
    const code = arg('--otp');
    if (code) {
      try {
        const r = await getJson('/auth/otp/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code }),
        });
        record('POST /auth/otp/verify (login works)', r.status === 200 && r.body && !!r.body.token, `status ${r.status}`);
      } catch (e) { record('POST /auth/otp/verify', false, e.message); }
    }
  } else {
    console.log('SKIP  OTP send/login — pass --phone and --otp (or SMOKE_SEND_OTP=yes) to include it (sends a real SMS).');
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('smoke test error:', e); process.exit(1); });
