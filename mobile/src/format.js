// Shared formatting helpers.

export function formatPrice(listing) {
  const n = Number(listing.price || 0);
  const amount = `₹${n.toLocaleString('en-IN')}`;
  if (listing.price_type === 'per_unit' && listing.unit) return `${amount}/${listing.unit}`;
  return amount;
}

export function formatQty(listing) {
  if (listing.quantity == null) return '';
  const q = Number(listing.quantity);
  const qty = Number.isInteger(q) ? q : q.toFixed(1);
  return `${qty} ${listing.unit || ''}`.trim();
}

export function formatDistance(km) {
  if (km == null) return '';
  return `${km} km away`;
}

// Hours remaining before an urgent listing expires.
export function hoursLeft(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 3600000));
}

// Short creation date, e.g. "22 Oct 2026".
export function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return ''; }
}

// Build a lightweight square thumbnail URL for grid/list rendering.
// For Cloudinary URLs we inject an on-the-fly transformation
// (crop-fill to `size`px, auto quality + format) WITHOUT altering the stored
// original. Non-Cloudinary URLs (Supabase/local/other) are returned unchanged.
export function thumbUrl(url, size = 400) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/upload/';
  const i = url.indexOf('res.cloudinary.com');
  const u = url.indexOf(marker);
  if (i !== -1 && u !== -1) {
    const transform = `c_fill,w_${size},h_${size},q_auto,f_auto`;
    // avoid double-inserting if a transform already follows /upload/
    const after = url.slice(u + marker.length);
    if (after.startsWith(transform)) return url;
    return url.slice(0, u + marker.length) + transform + '/' + after;
  }
  return url;
}

// Status badge metadata consistent with the backend lifecycle:
// active | sold | expired | withdrawn.
export const STATUS_META = {
  active:    { label: 'Active',    labelHi: 'चालू',   bg: '#E3F2FD', fg: '#0D47A1' },
  sold:      { label: 'Sold',      labelHi: 'बिका',   bg: '#E8F5E9', fg: '#2E7D32' },
  expired:   { label: 'Expired',   labelHi: 'समाप्त', bg: '#FFF3E0', fg: '#E65100' },
  withdrawn: { label: 'Withdrawn', labelHi: 'हटाया',  bg: '#ECEFF1', fg: '#455A64' },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.active;
}
