const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../lib/asyncHandler');

// GET /categories
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, slug, icon FROM categories ORDER BY sort_order, id'
  );
  res.json(rows);
}));

module.exports = router;
