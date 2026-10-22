const router = require('express').Router();
const db = require('../db');

// GET /categories
router.get('/', async (_req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, slug, icon FROM categories ORDER BY sort_order, id'
  );
  res.json(rows);
});

module.exports = router;
