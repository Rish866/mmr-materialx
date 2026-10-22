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

const pool = new Pool({
  connectionString: url,
  ssl: sslDisabled ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
