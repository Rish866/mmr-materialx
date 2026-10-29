#!/usr/bin/env node
/**
 * Portable test launcher.
 *
 * We do NOT rely on shell globbing (`test/**​/*.test.js`) because it behaves
 * differently across shells (npm runs scripts via `sh -c`, where `**` is not
 * expanded without globstar) and across Node versions. Instead we enumerate the
 * test files ourselves and hand them explicitly to Node's built-in test runner.
 *
 * Tests share one database, so they must run serially (--test-concurrency=1).
 * --test-force-exit guarantees the process exits even with the pool/server open.
 */
const { readdirSync, statSync } = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const testDir = path.join(__dirname, '..', 'test');

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (entry.endsWith('.test.js')) out.push(full);
  }
  return out.sort();
}

const files = collect(testDir);
if (files.length === 0) {
  console.error('No *.test.js files found in', testDir);
  process.exit(1);
}

const args = ['--test', '--test-concurrency=1', '--test-force-exit', ...files];
const res = spawnSync(process.execPath, args, { stdio: 'inherit' });

// Propagate the real exit code so CI fails on any test failure.
process.exit(res.status === null ? 1 : res.status);
