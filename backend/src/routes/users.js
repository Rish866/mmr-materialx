const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

// GET /me  -> current profile
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, phone, name, business_name, latitude, longitude, hub_name, created_at
       FROM users WHERE id=$1`,
    [req.user.uid]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
}));

// PATCH /me  { name, business_name, latitude, longitude, hub_name }
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `UPDATE users SET
        name          = COALESCE($2, name),
        business_name = COALESCE($3, business_name),
        latitude      = COALESCE($4, latitude),
        longitude     = COALESCE($5, longitude),
        hub_name      = COALESCE($6, hub_name)
      WHERE id=$1
      RETURNING id, phone, name, business_name, latitude, longitude, hub_name, created_at`,
    [req.user.uid, b.name, b.business_name, b.latitude, b.longitude, b.hub_name]
  );
  res.json(rows[0]);
}));

module.exports = router;
