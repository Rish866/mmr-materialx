const { Pool } = require('pg');

const url = process.env.DATABASE_URL || '';
// SSL on by default for managed Postgres (Supabase/Neon/Railway); disabled for
// local/socket connections or when PGSSL=disable is set explicitly.
const sslDisabled =
  process.env.PGSSL === 'disable' ||
  url.includes('localhost') ||
  url.includes('127.0.0.1') ||
  url.includes('host=/') ||       // unix socket
  url.includes('sslmode=disable');

function intEnv(name, def) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

const pool = new Pool({
  connectionString: url,
  ssl: sslDisabled ? false : { rejectUnauthorized: false },
  // Keep the pool small: managed Postgres free tiers (Neon/Supabase) cap
  // connections, and a single pilot instance needs few. Configurable via env.
  max: intEnv('PG_POOL_MAX', 10),
  idleTimeoutMillis: intEnv('PG_IDLE_TIMEOUT_MS', 30000),
  // Fail fast if the DB is unreachable instead of hanging a request.
  connectionTimeoutMillis: intEnv('PG_CONNECT_TIMEOUT_MS', 10000),
});

pool.on('error', (err) => {
  // A broken idle client should not crash the process.
  console.error('[db] unexpected idle client error', err && err.message);
});

// Lightweight connectivity probe for the health check / startup verification.
async function healthCheck() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0] && res.rows[0].ok === 1;
}

// Close the pool for graceful shutdown. Safe to call more than once.
let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  try { await pool.end(); } catch (e) { /* already closing */ }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  healthCheck,
  close,
};
