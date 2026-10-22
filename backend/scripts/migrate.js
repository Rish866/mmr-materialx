require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

(async () => {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    console.log('applying', f);
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.query(sql);
  }
  console.log('migrations done');
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
