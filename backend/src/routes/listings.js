const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Haversine distance (km) SQL fragment. $1=lat, $2=lng reference point.
const DISTANCE_SQL = `
  6371 * acos(
    LEAST(1, cos(radians($1)) * cos(radians(latitude)) *
      cos(radians(longitude) - radians($2)) +
      sin(radians($1)) * sin(radians(latitude)))
  )`;

// POST /listings  (create)  — auth required
router.post('/', requireAuth, async (req, res) => {
  const b = req.body;
  if (!b.title || !b.category_id || b.latitude == null || b.longitude == null) {
    return res.status(400).json({ error: 'missing_fields' });
  }
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
});

// GET /listings?lat=&lng=&radius_km=25&category=paints&q=epoxy
// Hyper-local feed: urgent first, then nearest. Expired urgent listings hidden.
router.get('/', async (req, res) => {
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
});

// GET /listings/:id  — detail incl. seller contact for the WhatsApp link
router.get('/:id', async (req, res) => {
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
});

// PATCH /listings/:id/status  { status }  — owner only
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!['active', 'sold', 'expired'].includes(status)) {
    return res.status(400).json({ error: 'bad_status' });
  }
  const { rows } = await db.query(
    `UPDATE listings SET status=$1 WHERE id=$2 AND user_id=$3 RETURNING id, status`,
    [status, req.params.id, req.user.uid]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found_or_not_owner' });
  res.json(rows[0]);
});

// POST /listings/:id/interest  { offer_price? }  -> { whatsapp_url }
// Logs buyer interest (analytics) and returns a pre-filled WhatsApp deep link.
router.post('/:id/interest', requireAuth, async (req, res) => {
  const offer = req.body.offer_price != null ? Number(req.body.offer_price) : null;

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
});

module.exports = router;
