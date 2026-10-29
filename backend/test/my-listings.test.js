const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let sellerToken; // user id 1
let otherToken;  // user id 2

test.before(async () => {
  await h.applyMigrations();
  await h.startServer();
});
test.after(async () => { await h.stopServer(); });

test.beforeEach(async () => {
  await h.resetData();
  sellerToken = (await h.loginViaOtp('9800000001')).token; // id 1
  otherToken = (await h.loginViaOtp('9800000002')).token;  // id 2
});

// ---------------- GET /listings/mine ----------------

test('GET /listings/mine requires auth', async () => {
  const { status } = await h.http('GET', '/listings/mine');
  assert.equal(status, 401);
});

test('GET /listings/mine returns ONLY the current user\'s listings, all statuses', async () => {
  await h.seedListing({ user_id: 1, title: 'Mine active', status: 'active' });
  await h.seedListing({ user_id: 1, title: 'Mine sold', status: 'sold' });
  await h.seedListing({ user_id: 2, title: 'Not mine' });

  const { status, body } = await h.http('GET', '/listings/mine', { token: sellerToken });
  assert.equal(status, 200);
  assert.equal(body.length, 2, 'only the two listings owned by user 1');
  const titles = body.map((x) => x.title).sort();
  assert.deepEqual(titles, ['Mine active', 'Mine sold']);
  // includes non-active statuses (unlike the public feed)
  assert.ok(body.some((x) => x.status === 'sold'));
  // carries category info for display
  assert.ok(body.every((x) => x.category_slug));
});

test('GET /listings/mine lazily flips an expired urgent listing to status=expired', async () => {
  // active + urgent but expiry already in the past
  await h.seedListing({
    user_id: 1, title: 'Stale urgent', status: 'active', is_urgent: true,
    expires_at: new Date(Date.now() - 60 * 1000),
  });
  const { body } = await h.http('GET', '/listings/mine', { token: sellerToken });
  assert.equal(body.length, 1);
  assert.equal(body[0].status, 'expired', 'past-expiry urgent is reported as expired, not active');
});

test('GET /listings/mine leaves a still-valid urgent listing active', async () => {
  await h.seedListing({
    user_id: 1, title: 'Fresh urgent', status: 'active', is_urgent: true,
    expires_at: new Date(Date.now() + 3600 * 1000),
  });
  const { body } = await h.http('GET', '/listings/mine', { token: sellerToken });
  assert.equal(body[0].status, 'active');
});

// ---------------- PATCH /listings/:id (edit) ----------------

test('PATCH /listings/:id requires auth', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status } = await h.http('PATCH', `/listings/${l.id}`, { body: { title: 'x' } });
  assert.equal(status, 401);
});

test('PATCH /listings/:id updates editable fields for the owner', async () => {
  const l = await h.seedListing({ user_id: 1, title: 'Old', price: 100, is_urgent: false });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken,
    body: { title: 'New Title', price: 250, price_type: 'total', quantity: 5, unit: 'drum' },
  });
  assert.equal(status, 200);
  assert.equal(body.listing.title, 'New Title');
  assert.equal(Number(body.listing.price), 250);
  assert.equal(body.listing.price_type, 'total');
  assert.equal(Number(body.listing.quantity), 5);
  assert.equal(body.listing.unit, 'drum');
});

test('PATCH /listings/:id toggling is_urgent ON sets a ~24h expiry', async () => {
  const l = await h.seedListing({ user_id: 1, is_urgent: false, expires_at: null });
  const { body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { is_urgent: true },
  });
  assert.equal(body.listing.is_urgent, true);
  assert.ok(body.listing.expires_at, 'expiry set');
  const ms = new Date(body.listing.expires_at).getTime() - Date.now();
  assert.ok(ms > 23 * 3600 * 1000 && ms < 25 * 3600 * 1000);
});

test('PATCH /listings/:id toggling is_urgent OFF clears the expiry', async () => {
  const l = await h.seedListing({
    user_id: 1, is_urgent: true, expires_at: new Date(Date.now() + 3600 * 1000),
  });
  const { body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { is_urgent: false },
  });
  assert.equal(body.listing.is_urgent, false);
  assert.equal(body.listing.expires_at, null);
});

test('PATCH /listings/:id does NOT let a non-owner edit (404)', async () => {
  const l = await h.seedListing({ user_id: 1, title: 'Owned by 1' });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: otherToken, body: { title: 'hacked' },
  });
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found_or_not_owner');

  // confirm the title was NOT changed in the DB
  const client = await h.dbClient();
  const { rows } = await client.query('SELECT title FROM listings WHERE id=$1', [l.id]);
  assert.equal(rows[0].title, 'Owned by 1');
});

test('PATCH /listings/:id rejects an empty title (400)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { title: '   ' },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_title');
});

test('PATCH /listings/:id rejects an invalid price_type (400)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { price_type: 'weekly' },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_price_type');
});

test('PATCH /listings/:id rejects a non-numeric price (400)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { price: 'abc' },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_price');
});

test('PATCH /listings/:id rejects an unknown category (400)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { category_id: 99999 },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_category');
});

test('PATCH /listings/:id rejects photos that are not an array (400)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { photos: 'not-an-array' },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_photos');
});

test('PATCH /listings/:id with no editable fields (400 no_fields)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { not_a_field: 1 },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'no_fields');
});

test('PATCH /listings/:id 404 for a non-numeric id', async () => {
  const { status } = await h.http('PATCH', '/listings/abc', { token: sellerToken, body: { title: 'x' } });
  assert.equal(status, 404);
});

test('PATCH /listings/:id updates photos array (keeps the stored originals)', async () => {
  const l = await h.seedListing({ user_id: 1, photos: ['https://cdn/old.jpg'] });
  const next = ['https://cdn/old.jpg', 'https://cdn/new.jpg'];
  const { body } = await h.http('PATCH', `/listings/${l.id}`, {
    token: sellerToken, body: { photos: next },
  });
  assert.deepEqual(body.listing.photos, next);
});

// ---------------- extended status lifecycle ----------------

test('PATCH /listings/:id/status accepts "withdrawn" for the owner', async () => {
  const l = await h.seedListing({ user_id: 1, status: 'active' });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}/status`, {
    token: sellerToken, body: { status: 'withdrawn' },
  });
  assert.equal(status, 200);
  assert.equal(body.status, 'withdrawn');
});

test('a withdrawn listing is hidden from the public feed', async () => {
  const l = await h.seedListing({ user_id: 1, title: 'Gone', status: 'active', latitude: 19.136, longitude: 73.022 });
  await h.http('PATCH', `/listings/${l.id}/status`, { token: sellerToken, body: { status: 'withdrawn' } });
  const { body } = await h.http('GET', '/listings?lat=19.136&lng=73.022&radius_km=50');
  assert.ok(!body.some((x) => x.id === l.id), 'withdrawn listing must not appear in feed');
});

test('a re-activated listing reappears in the public feed', async () => {
  const l = await h.seedListing({ user_id: 1, title: 'Back', status: 'withdrawn', latitude: 19.136, longitude: 73.022 });
  await h.http('PATCH', `/listings/${l.id}/status`, { token: sellerToken, body: { status: 'active' } });
  const { body } = await h.http('GET', '/listings?lat=19.136&lng=73.022&radius_km=50');
  assert.ok(body.some((x) => x.id === l.id));
});

test('PATCH /listings/:id/status still rejects an invalid status (400)', async () => {
  const l = await h.seedListing({ user_id: 1 });
  const { status, body } = await h.http('PATCH', `/listings/${l.id}/status`, {
    token: sellerToken, body: { status: 'banana' },
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'bad_status');
});
