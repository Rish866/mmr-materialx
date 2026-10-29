/**
 * Small, dependency-free validation helpers aligned to the app's business rules.
 */

// Normalise an Indian mobile number to bare E.164 digits (no '+').
function normalisePhone(raw) {
  let p = String(raw || '').replace(/[^\d]/g, '');
  if (p.length === 10) p = '91' + p; // add India country code
  return p;
}

// Valid normalised phone: 12–15 digits (India = 12, allow some intl slack).
function isValidPhone(normalised) {
  return /^\d{12,15}$/.test(normalised);
}

// Positive integer id (used for path ids and category ids).
function isId(v) {
  return /^\d+$/.test(String(v));
}

// A finite, non-negative number within a sane upper bound (prevents overflow
// and absurd values). Allows null/undefined (caller decides if required).
function isMoneyOrQty(v, { max = 1e12 } = {}) {
  if (v === null || v === undefined) return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max;
}

// Image reference validation: only allow https URLs (or, in dev, local file/
// content URIs that the app keeps when UPLOAD_PROVIDER=local). Never allow
// javascript:, data:, or other schemes that could be dangerous if rendered.
function isAllowedImageRef(ref, { allowLocal = false } = {}) {
  if (typeof ref !== 'string' || ref.length === 0 || ref.length > 2048) return false;
  if (/^https:\/\/[^\s]+$/i.test(ref)) return true;
  if (allowLocal && /^(file:|content:|assets-library:|ph:)/i.test(ref)) return true;
  return false;
}

// Validate a photos array (<=4 entries, each an allowed image ref).
function validatePhotos(photos, { allowLocal = false, max = 4 } = {}) {
  if (!Array.isArray(photos)) return 'invalid_photos';
  if (photos.length > max) return 'too_many_photos';
  for (const p of photos) {
    if (!isAllowedImageRef(p, { allowLocal })) return 'invalid_photo_url';
  }
  return null; // ok
}

// Latitude / longitude sanity.
function isLat(v) { const n = Number(v); return Number.isFinite(n) && n >= -90 && n <= 90; }
function isLng(v) { const n = Number(v); return Number.isFinite(n) && n >= -180 && n <= 180; }

module.exports = {
  normalisePhone, isValidPhone, isId, isMoneyOrQty,
  isAllowedImageRef, validatePhotos, isLat, isLng,
};
