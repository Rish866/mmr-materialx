const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');
const v = require('../lib/validate');
const asyncHandler = require('../lib/asyncHandler');

// In dev with UPLOAD_PROVIDER=local the app keeps local image URIs, so those
// are accepted; in prod only https storage URLs are allowed.
const ALLOW_LOCAL_PHOTOS = !config.isProd;

// Haversine distance (km) SQL fragment. $1=lat, $2=lng reference point.
const DISTANCE_SQL = `
  6371 * acos(
    LEAST(1, cos(radians($1)) * cos(radians(latitude)) *
      cos(radians(longitude) - radians($2)) +
      sin(radians($1)) * sin(radians(latitude)))
  )`;

// POST /listings  (create)  — auth required
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.title || !String(b.title).trim() || !b.category_id || b.latitude == null || b.longitude == null) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  // Business-rule validation (parameterised queries below prevent injection;
  // this rejects nonsensical/abusive values early with clear error codes).
  if (String(b.title).length > 200) return res.status(400).json({ error: 'invalid_title' });
  if (!v.isId(b.category_id)) return res.status(400).json({ error: 'invalid_category' });
  if (!v.isLat(b.latitude) || !v.isLng(b.longitude)) return res.status(400).json({ error: 'invalid_location' });
  if (!v.isMoneyOrQty(b.price)) return res.status(400).json({ error: 'invalid_price' });
  if (!v.isMoneyOrQty(b.quantity)) return res.status(400).json({ error: 'invalid_quantity' });
  if ('price_type' in b && !['per_unit', 'total'].includes(b.price_type)) {
    return res.status(400).json({ error: 'invalid_price_type' });
  }
  if ('photos' in b) {
    const perr = v.validatePhotos(b.photos, { allowLocal: ALLOW_LOCAL_PHOTOS });
    if (perr) return res.status(400).json({ error: perr });
  }
  const catOk = await db.query('SELECT 1 FROM categories WHERE id=$1', [b.category_id]);
  if (!catOk.rows.length) return res.status(400).json({ error: 'invalid_category' });

  const isUrgent = !!b.is_urgent;
  const expiresAt = isUrgent ? new Date(Date.now() + 24 * 3600 * 1000) : null;

  const { rows } = await db.query(
    `INSERT INTO listings
       (user_id, category_id, title, quantity, unit, price, price_type,
        is_urgent, latitude, longitude, hub_name, photos, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      req.user.uid, b.category_id, b.title, b.quantity ?? null, b.unit ?? null,
      b.price ?? null, b.price_type || 'per_unit', isUrgent,
      b.latitude, b.longitude, b.hub_name ?? null,
      Array.isArray(b.photos) ? b.photos : [], expiresAt,
    ]
  );
  res.status(201).json({ listing: rows[0] });
}));

// GET /listings?lat=&lng=&radius_km=25&category=paints&q=epoxy
// Hyper-local feed: urgent first, then nearest. Expired urgent listings hidden.
router.get('/', asyncHandler(async (req, res) => {
  const { lat, lng, radius_km = 25, category, q } = req.query;
  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'lat_lng_required' });
  }

  const params = [parseFloat(lat), parseFloat(lng)];
  let where = `l.status = 'active' AND (l.expires_at IS NULL OR l.expires_at > now())`;

  if (category && category !== 'all') {
    params.push(category);
    where += ` AND l.category_id = (SELECT id FROM categories WHERE slug = $${params.length})`;
  }
  if (q) {
    params.push(`%${q}%`);
    where += ` AND l.title ILIKE $${params.length}`;
  }
  params.push(parseFloat(radius_km));
  const radiusIdx = params.length;

  const sql = `
    SELECT l.*, c.slug AS category_slug, c.name AS category_name,
           ROUND((${DISTANCE_SQL})::numeric, 1) AS distance_km
    FROM listings l
    JOIN categories c ON c.id = l.category_id
    WHERE ${where}
      AND (${DISTANCE_SQL}) <= $${radiusIdx}
    ORDER BY l.is_urgent DESC, distance_km ASC, l.created_at DESC
    LIMIT 100`;

  const { rows } = await db.query(sql, params);
  res.json(rows);
}));

// GET /listings/mine  — the authenticated seller's own listings (ALL statuses).
// NOTE: must be declared BEFORE '/:id' so "mine" isn't captured as an id.
// Lazily flips any of this seller's urgent listings whose expiry has passed to
// status 'expired' so the UI never shows a stale 'active'. This is a safe,
// infra-free cleanup scoped to the requesting owner's own rows only.
router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE listings SET status='expired'
      WHERE user_id=$1 AND status='active'
        AND expires_at IS NOT NULL AND expires_at <= now()`,
    [req.user.uid]
  );
  const { rows } = await db.query(
    `SELECT l.*, c.slug AS category_slug, c.name AS category_name
       FROM listings l
       JOIN categories c ON c.id = l.category_id
      WHERE l.user_id = $1
      ORDER BY l.created_at DESC`,
    [req.user.uid]
  );
  res.json(rows);
}));

// GET /listings/:id  — detail incl. seller contact for the WhatsApp link
router.get('/:id', asyncHandler(async (req, res) => {
  if (!v.isId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { rows } = await db.query(
    `SELECT l.*, c.slug AS category_slug, c.name AS category_name,
            u.phone AS seller_phone, u.name AS seller_name,
            u.business_name AS seller_business
       FROM listings l
       JOIN categories c ON c.id = l.category_id
       JOIN users u ON u.id = l.user_id
      WHERE l.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
}));

// Valid listing lifecycle states. 'withdrawn' lets a seller take a listing off
// the market without a destructive delete (keeps analytics + history intact).
const LISTING_STATUSES = ['active', 'sold', 'expired', 'withdrawn'];

// PATCH /listings/:id  — edit listing fields (owner only).
// Only whitelisted, user-editable columns can change; ownership is enforced in
// the WHERE clause so a non-owner can never mutate someone else's listing.
router.patch('/:id', requireAuth, asyncHandler(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};

  // Validate the fields that are present (partial update allowed).
  if ('title' in b && (!b.title || !String(b.title).trim())) {
    return res.status(400).json({ error: 'invalid_title' });
  }
  if ('price_type' in b && !['per_unit', 'total'].includes(b.price_type)) {
    return res.status(400).json({ error: 'invalid_price_type' });
  }
  if ('photos' in b) {
    const perr = v.validatePhotos(b.photos, { allowLocal: ALLOW_LOCAL_PHOTOS });
    if (perr) return res.status(400).json({ error: perr });
  }
  for (const num of ['quantity', 'price']) {
    if (num in b && b[num] !== null && Number.isNaN(Number(b[num]))) {
      return res.status(400).json({ error: `invalid_${num}` });
    }
  }
  if ('category_id' in b) {
    const cat = await db.query('SELECT 1 FROM categories WHERE id=$1', [b.category_id]);
    if (!cat.rows.length) return res.status(400).json({ error: 'invalid_category' });
  }

  // Build a dynamic SET from only the editable fields that were provided.
  const editable = ['title', 'category_id', 'quantity', 'unit', 'price',
    'price_type', 'is_urgent', 'hub_name', 'photos'];
  const sets = [];
  const vals = [];
  for (const f of editable) {
    if (f in b) { vals.push(f === 'photos' ? (b[f] || []) : b[f]); sets.push(`${f}=$${vals.length}`); }
  }

  // Toggling is_urgent updates the 24h expiry window consistently with create.
  if ('is_urgent' in b) {
    if (b.is_urgent) {
      vals.push(new Date(Date.now() + 24 * 3600 * 1000));
      sets.push(`expires_at=$${vals.length}`);
    } else {
      sets.push(`expires_at=NULL`);
    }
  }

  if (!sets.length) return res.status(400).json({ error: 'no_fields' });

  vals.push(req.params.id);
  vals.push(req.user.uid);
  const { rows } = await db.query(
    `UPDATE listings SET ${sets.join(', ')}
      WHERE id=$${vals.length - 1} AND user_id=$${vals.length}
      RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found_or_not_owner' });
  res.json({ listing: rows[0] });
}));

// PATCH /listings/:id/status  { status }  — owner only
router.patch('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  if (!v.isId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { status } = req.body || {};
  if (!LISTING_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'bad_status' });
  }
  const { rows } = await db.query(
    `UPDATE listings SET status=$1 WHERE id=$2 AND user_id=$3 RETURNING id, status`,
    [status, req.params.id, req.user.uid]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found_or_not_owner' });
  res.json(rows[0]);
}));

// POST /listings/:id/interest  { offer_price? }  -> { whatsapp_url }
// Logs buyer interest (analytics) and returns a pre-filled WhatsApp deep link.
router.post('/:id/interest', requireAuth, asyncHandler(async (req, res) => {
  if (!v.isId(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const offer = b.offer_price != null ? Number(b.offer_price) : null;
  if (offer !== null && !v.isMoneyOrQty(offer)) return res.status(400).json({ error: 'invalid_offer' });

  const { rows } = await db.query(
    `SELECT l.title, l.price, l.price_type, u.phone
       FROM listings l JOIN users u ON u.id = l.user_id
      WHERE l.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });

  await db.query(
    `INSERT INTO deal_interests (listing_id, buyer_id, offer_price) VALUES ($1,$2,$3)`,
    [req.params.id, req.user.uid, offer]
  );

  const l = rows[0];
  const offerLine = offer != null ? ` My offer: ₹${offer}.` : '';
  const text = encodeURIComponent(
    `Hi, I saw your "${l.title}" (₹${l.price}) on MMR MaterialX.${offerLine} Is it still available?`
  );
  res.json({ whatsapp_url: `https://wa.me/${l.phone}?text=${text}` });
}));

module.exports = router;
