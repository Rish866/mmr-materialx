#!/usr/bin/env node
/**
 * Lightweight, dependency-free syntax gate.
 *
 * We do NOT ship a heavy ESLint setup for the MVP (avoids extra dependencies).
 * Instead this parses every backend .js file with Node's own parser via
 * `node --check`, failing (non-zero exit) on any syntax error. CI runs this as
 * the "lint" step. You can later replace it with ESLint if you want style rules.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['src', 'scripts', 'test'];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`SYNTAX ERROR: ${path.relative(ROOT, f)}`);
    console.error(e.stderr ? e.stderr.toString() : e.message);
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed the syntax check.`);
  process.exit(1);
}
console.log(`lint ok — ${files.length} files parsed cleanly`);
