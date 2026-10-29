/**
 * Postgres-backed rate limiting.
 *
 * Using the existing database as the shared store means limits are enforced
 * CONSISTENTLY across multiple backend replicas — unlike an in-memory counter,
 * which would let an attacker multiply their allowance by the number of
 * instances behind the load balancer. No extra infrastructure (Redis) is
 * introduced; this fits the MVP's single-datastore architecture.
 */
const db = require('../db');

/**
 * Record an event and return how many events exist for (bucket, key) within
 * the trailing `windowSec` seconds (including the one just recorded).
 */
async function hitAndCount(bucket, key, windowSec) {
  await db.query('INSERT INTO rate_events (bucket, key) VALUES ($1, $2)', [bucket, key]);
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM rate_events
      WHERE bucket=$1 AND key=$2 AND created_at > now() - ($3 || ' seconds')::interval`,
    [bucket, key, String(windowSec)]
  );
  return rows[0].n;
}

/** Count events for (bucket, key) in the window WITHOUT recording a new one. */
async function count(bucket, key, windowSec) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM rate_events
      WHERE bucket=$1 AND key=$2 AND created_at > now() - ($3 || ' seconds')::interval`,
    [bucket, key, String(windowSec)]
  );
  return rows[0].n;
}

/** Seconds since the most recent event for (bucket, key), or null if none. */
async function secondsSinceLast(bucket, key) {
  const { rows } = await db.query(
    `SELECT EXTRACT(EPOCH FROM (now() - max(created_at)))::int AS secs
       FROM rate_events WHERE bucket=$1 AND key=$2`,
    [bucket, key]
  );
  return rows[0].secs; // null if no rows
}

/**
 * Enforce a sliding-window limit. Returns { allowed, count, limit }.
 * When allowed, the event has been recorded. When not allowed, nothing new is
 * recorded (so being over-limit does not extend the window further).
 */
async function enforce(bucket, key, limit, windowSec) {
  const current = await count(bucket, key, windowSec);
  if (current >= limit) return { allowed: false, count: current, limit };
  const n = await hitAndCount(bucket, key, windowSec);
  return { allowed: true, count: n, limit };
}

/** Best-effort cleanup of events older than `olderThanSec` (housekeeping). */
async function cleanup(olderThanSec = 24 * 3600) {
  try {
    await db.query(
      `DELETE FROM rate_events WHERE created_at < now() - ($1 || ' seconds')::interval`,
      [String(olderThanSec)]
    );
  } catch (e) {
    // non-fatal
  }
}

/** Best-effort client IP extraction (honours a single proxy hop). */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

module.exports = { hitAndCount, count, secondsSinceLast, enforce, cleanup, clientIp };
