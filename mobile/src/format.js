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
