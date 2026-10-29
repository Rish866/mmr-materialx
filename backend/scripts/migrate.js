/**
 * Repeatable, SAFE schema migrations.
 *
 * - Applies every backend/migrations/*.sql in sorted order.
 * - All migrations are written to be IDEMPOTENT (CREATE TABLE IF NOT EXISTS,
 *   ADD COLUMN IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING), so running
 *   this repeatedly on an existing database is safe and non-destructive.
 * - This script NEVER drops tables or deletes data. As a guardrail it refuses
 *   to run a migration file containing DROP TABLE / TRUNCATE / DELETE unless
 *   ALLOW_DESTRUCTIVE_MIGRATIONS=yes is explicitly set.
 *
 * Run it as a SEPARATE step from server startup (e.g. a Render pre-deploy
 * command or `npm run migrate`), not inside `npm start`.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is not set. Refusing to run.');
  process.exit(1);
}

const db = require('../src/db');

const DESTRUCTIVE = /\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i;
const allowDestructive = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === 'yes';

(async () => {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) {
    console.log('[migrate] no migration files found');
    await db.close();
    return;
  }

  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    if (DESTRUCTIVE.test(sql) && !allowDestructive) {
      console.error(
        `[migrate] REFUSING to apply "${f}": it contains a destructive statement ` +
        '(DROP TABLE / TRUNCATE / DELETE). Set ALLOW_DESTRUCTIVE_MIGRATIONS=yes ' +
        'only if you have explicit authorization and a backup.'
      );
      await db.close();
      process.exit(1);
    }
  }

  for (const f of files) {
    console.log('[migrate] applying', f);
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.query(sql);
  }
  console.log('[migrate] done — schema is up to date');
  await db.close();
})().catch((e) => {
  console.error('[migrate] failed:', e && e.message);
  process.exit(1);
});
