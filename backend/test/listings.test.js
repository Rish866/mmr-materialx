const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let token;      // seller token (user id 1)
let buyerToken; // buyer token (user id 2)

test.before(async () => {
  await h.applyMigrations();
  await h.startServer();
});
test.after(async () => { await h.stopServer(); });

test.beforeEach(async () => {
  await h.resetData();
  // create two users deterministically: id 1 (seller), id 2 (buyer)
  const seller = await h.loginViaOtp('9800000001'); // -> user id 1
  const buyer = await h.loginViaOtp('9800000002');  // -> user id 2
  token = seller.token;
  buyerToken = buyerToken = buyer.token;
  // give the seller a phone-known profile for WhatsApp links (already has phone)
});

test('POST /listings requires auth (401 without token)', async () => {
  const { status, body } = await h.http('POST', '/listings', {
    body: { title: 'x', category_id: 1, latitude: 19.1, longitude: 73.0 },
  });
  assert.equal(status, 401);
  assert.equal(body.error, 'no_token');
});

test('POST /listings with a bad token is rejected 401', async () => {
  const { status, body } = await h.http('POST', '/listings', {
    token: 'not-a-jwt',
    body: { title: 'x', category_id: 1, latitude: 19.1, longitude: 73.0 },
  });
  assert.equal(status, 401);
  assert.equal(body.error, 'bad_token');
});

test('POST /listings rejects missing required fields 400', async () => {
  const { status, body } = await h.http('POST', '/listings', {
    token, body: { title: '', category_id: null },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'missing_fields');
});

test('POST /listings creates a listing and stores the photo URL array', async () => {
  const photos = ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'];
  const { status, body } = await h.http('POST', '/listings', {
    token,
    body: {
      title: 'Epoxy Primer 20L', category_id: 1, quantity: 200, unit: 'litres',
      price: 12000, price_type: 'total', is_urgent: false,
      latitude: 19.136, longitude: 73.022, hub_name: 'Rabale', photos,
    },
  });
  assert.equal(status, 201);
  assert.equal(body.listing.title, 'Epoxy Primer 20L');
  assert.deepEqual(body.listing.photos, photos);
  assert.equal(body.listing.status, 'active');
  assert.equal(body.listing.expires_at, null, 'non-urgent listing has no expiry');
});

test('POST /listings marked urgent gets a 24h expiry', async () => {
  const { body } = await h.http('POST', '/listings', {
    token,
    body: {
      title: 'Urgent lot', category_id: 1, price: 5000, is_urgent: true,
      latitude: 19.136, longitude: 73.022,
    },
  });
  assert.ok(body.listing.expires_at, 'urgent listing should have an expiry');
  const ms = new Date(body.listing.expires_at).getTime() - Date.now();
  assert.ok(ms > 23 * 3600 * 1000 && ms < 25 * 3600 * 1000, 'expiry ~24h out');
});

test('GET /listings requires lat & lng (400 otherwise)', async () => {
  const { status, body } = await h.http('GET', '/listings');
  assert.equal(status, 400);
  assert.equal(body.error, 'lat_lng_required');
});

test('GET /listings feed sorts urgent-first then by distance, with distance_km', async () => {
  // urgent far, non-urgent near
  await h.seedListing({ title: 'Near normal', latitude: 19.136, longitude: 73.022, is_urgent: false });
  await h.seedListing({ title: 'Far urgent', latitude: 19.20, longitude: 73.10, is_urgent: true, expires_at: new Date(Date.now() + 3600e3) });
  const { status, body } = await h.http('GET', '/listings?lat=19.136&lng=73.022&radius_km=50');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body) && body.length === 2);
  assert.equal(body[0].title, 'Far urgent', 'urgent must come first');
  assert.ok(typeof body[0].distance_km !== 'undefined', 'carries distance_km');
});

test('GET /listings radius filter narrows the feed', async () => {
  await h.seedListing({ title: 'Here', latitude: 19.136, longitude: 73.022 });
  await h.seedListing({ title: 'Far away', latitude: 19.90, longitude: 73.90 }); // ~>50km
  const near = await h.http('GET', '/listings?lat=19.136&lng=73.022&radius_km=5');
  const far = await h.http('GET', '/listings?lat=19.136&lng=73.022&radius_km=200');
  assert.equal(near.body.length, 1);
  assert.equal(far.body.length, 2);
});

test('GET /listings category filter returns only that category', async () => {
  await h.seedListing({ title: 'Paint item', category_id: 1 });
  await h.seedListing({ title: 'Metal item', category_id: 2 });
  const { body } = await h.http('GET', '/listings?lat=19.136&lng=73.022&radius_km=50&category=metal');
  assert.ok(body.every((x) => x.category_slug === 'metal'));
  assert.equal(body.length, 1);
});

test('GET /listings title search (q) filters case-insensitively', async () => {
  await h.seedListing({ title: 'Leftover Epoxy Primer' });
  await h.seedListing({ title: 'MS Sheets' });
  const { body } = await h.http('GET', '/listings?lat=19.136&lng=73.022&radius_km=50&q=epoxy');
  assert.equal(body.length, 1);
  assert.match(body[0].title, /Epoxy/);
});

test('GET /listings hides sold and expired-urgent listings', async () => {
  await h.seedListing({ title: 'Sold one', status: 'sold' });
  await h.seedListing({ title: 'Expired urgent', is_urgent: true, expires_at: new Date(Date.now() - 1000) });
  await h.seedListing({ title: 'Visible' });
  const { body } = await h.http('GET', '/listings?lat=19.136&lng=73.022&radius_km=50');
  assert.equal(body.length, 1);
  assert.equal(body[0].title, 'Visible');
});

test('GET /listings/:id returns detail with seller contact', async () => {
  const l = await h.seedListing({ title: 'Detail me' });
  const { status, body } = await h.http('GET', `/listings/${l.id}`);
  assert.equal(status, 200);
  assert.equal(body.title, 'Detail me');
  assert.ok(body.seller_phone, 'detail includes seller phone for WhatsApp');
  assert.equal(body.category_slug, 'paints');
});

test('GET /listings/:id returns 404 for an unknown id', async () => {
  const { status, body } = await h.http('GET', '/listings/999999');
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found');
});

test('PATCH /listings/:id/status marks sold for the OWNER', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}/status`, { token, body: { status: 'sold' } });
  assert.equal(status, 200);
  assert.equal(body.status, 'sold');
});

test('PATCH /listings/:id/status rejects a NON-owner (404 not owner)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}/status`, {
    token: buyerToken, body: { status: 'sold' },
  });
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found_or_not_owner');
});

test('PATCH /listings/:id/status rejects an invalid status value 400', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}/status`, { token, body: { status: 'banana' } });
  assert.equal(status, 400);
  assert.equal(body.error, 'bad_status');
});

test('POST /listings/:id/interest returns a safe pre-filled WhatsApp URL with the offer', async () => {
  const l = await h.seedListing({ user_id: 1, title: 'Epoxy 20L', price: 12000 });
  const { status, body } = await h.http('POST', `/listings/${l.id}/interest`, {
    token: buyerToken, body: { offer_price: 10500 },
  });
  assert.equal(status, 200);
  assert.match(body.whatsapp_url, /^https:\/\/wa\.me\/\d+\?text=/, 'valid wa.me link');
  // the offer and a safely URL-encoded message are present (no raw spaces/quotes)
  assert.ok(body.whatsapp_url.includes('10500'));
  assert.ok(!/\s/.test(body.whatsapp_url), 'URL must not contain raw spaces');
  assert.ok(!body.whatsapp_url.includes('"'), 'URL must not contain raw quotes');

  // interest is logged for analytics
  const client = await h.dbClient();
  const { rows } = await client.query('SELECT count(*)::int AS n FROM deal_interests WHERE listing_id=$1', [l.id]);
  assert.equal(rows[0].n, 1);
});

test('POST /listings/:id/interest works without an offer (null)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('POST', `/listings/${l.id}/interest`, { token: buyerToken, body: {} });
  assert.equal(status, 200);
  assert.match(body.whatsapp_url, /^https:\/\/wa\.me\//);
});

test('POST /listings/:id/interest requires auth', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status } = await h.http('POST', `/listings/${l.id}/interest`, { body: {} });
  assert.equal(status, 401);
});

test('POST /listings/:id/interest 404 for unknown listing', async () => {
  const { status, body } = await h.http('POST', '/listings/999999/interest', { token: buyerToken, body: {} });
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found');
});
