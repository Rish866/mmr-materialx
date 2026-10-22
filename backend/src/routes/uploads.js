const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getUploadCredentials, provider } = require('../lib/uploads');

/**
 * POST /uploads/sign   (auth)
 * Body: { fileName?, contentType? }
 * Returns short-lived credentials for a DIRECT client->storage upload.
 * The storage secret never leaves the server.
 */
router.post('/sign', requireAuth, async (req, res) => {
  try {
    const creds = await getUploadCredentials({
      fileName: req.body?.fileName,
      contentType: req.body?.contentType,
    });
    res.json(creds);
  } catch (e) {
    const known = [
      'cloudinary_not_configured',
      'supabase_not_configured',
      'supabase_sign_failed',
    ];
    const msg = e.message || 'sign_failed';
    const status = known.some((k) => msg.startsWith(k)) ? 503 : 500;
    console.error('[uploads] sign error:', msg);
    res.status(status).json({ error: msg, provider: provider() });
  }
});

module.exports = router;
