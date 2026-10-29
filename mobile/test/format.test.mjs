// Pure-function unit tests for the shared formatting/display helpers.
// These need no React Native runtime, so they run on plain Node via node:test.
// (We deliberately avoid a heavy Jest/RN test harness for the MVP.)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPrice, formatQty, formatDistance, hoursLeft,
  formatDate, thumbUrl, statusMeta, STATUS_META,
} from '../src/format.js';

test('formatPrice: per_unit shows /unit', () => {
  assert.equal(formatPrice({ price: 45, price_type: 'per_unit', unit: 'kg' }), '₹45/kg');
});

test('formatPrice: total omits the unit', () => {
  assert.equal(formatPrice({ price: 12000, price_type: 'total', unit: 'litres' }), '₹12,000');
});

test('formatQty: integer vs decimal', () => {
  assert.equal(formatQty({ quantity: 200, unit: 'litres' }), '200 litres');
  assert.equal(formatQty({ quantity: 2.5, unit: 'ton' }), '2.5 ton');
  assert.equal(formatQty({ quantity: null }), '');
});

test('formatDistance', () => {
  assert.equal(formatDistance(3.2), '3.2 km away');
  assert.equal(formatDistance(null), '');
});

test('hoursLeft: future, past, and null', () => {
  assert.equal(hoursLeft(null), null);
  assert.equal(hoursLeft(new Date(Date.now() - 1000).toISOString()), 0);
  const h = hoursLeft(new Date(Date.now() + 5 * 3600 * 1000).toISOString());
  assert.ok(h >= 4 && h <= 5);
});

test('formatDate renders a readable date or empty for bad input', () => {
  assert.match(formatDate('2026-10-22T10:00:00Z'), /2026/);
  assert.equal(formatDate(null), '');
});

test('thumbUrl injects a Cloudinary transform without touching the original path', () => {
  const orig = 'https://res.cloudinary.com/demo/image/upload/v1699/x.jpg';
  const t = thumbUrl(orig, 400);
  assert.ok(t.includes('/upload/c_fill,w_400,h_400,q_auto,f_auto/'));
  assert.ok(t.endsWith('v1699/x.jpg'), 'original object path preserved');
});

test('thumbUrl is idempotent (does not double-insert the transform)', () => {
  const orig = 'https://res.cloudinary.com/demo/image/upload/v1/x.jpg';
  const once = thumbUrl(orig, 400);
  const twice = thumbUrl(once, 400);
  assert.equal(once, twice);
});

test('thumbUrl leaves non-Cloudinary URLs unchanged (Supabase/local)', () => {
  const supa = 'https://proj.supabase.co/storage/v1/object/public/listings/x.jpg';
  assert.equal(thumbUrl(supa, 400), supa);
  assert.equal(thumbUrl('file:///local/a.jpg', 400), 'file:///local/a.jpg');
  assert.equal(thumbUrl(undefined, 400), undefined);
});

test('statusMeta covers every backend status and falls back safely', () => {
  for (const s of ['active', 'sold', 'expired', 'withdrawn']) {
    assert.ok(STATUS_META[s], `has meta for ${s}`);
    assert.equal(statusMeta(s).label, STATUS_META[s].label);
  }
  // unknown status falls back to active's meta (never crashes the UI)
  assert.equal(statusMeta('???').label, STATUS_META.active.label);
});
