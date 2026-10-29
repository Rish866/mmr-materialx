require('dotenv').config();
const express = require('express');
const cors = require('cors');
const config = require('./config');

const app = express();

// Behind a load balancer / proxy (Railway, Render) the real client IP is in
// X-Forwarded-For. Trust a single proxy hop so req.ip is accurate for limits.
app.set('trust proxy', 1);
// Do not advertise the framework.
app.disable('x-powered-by');

// ---- CORS allowlist ----
// In production, only the configured origins may call the API. If none are
// configured we still allow non-browser clients (the mobile app sends no
// Origin header), but block unknown browser origins.
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);                 // mobile app / curl / server-to-server
    if (!config.corsOrigins.length) {
      // No allowlist configured: permissive in dev, deny unknown browser origins in prod.
      return cb(null, !config.isProd);
    }
    return cb(null, config.corsOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
};
app.use(cors(corsOptions));

// ---- Security headers (dependency-free; covers the essentials) ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // This is a JSON API; a strict CSP prevents any accidental HTML rendering.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// ---- Request-size limit (configurable) ----
app.use(express.json({ limit: config.jsonBodyLimit }));

// Tiny request log — method + path only. NEVER logs bodies, headers, or query
// strings, so OTPs / tokens / phone numbers never reach the logs here.
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'mmr-materialx' }));

app.use('/auth', require('./routes/auth'));
app.use('/categories', require('./routes/categories'));
app.use('/listings', require('./routes/listings'));
app.use('/uploads', require('./routes/uploads'));
app.use('/', require('./routes/users')); // /me

// Handle malformed JSON bodies explicitly (express.json throws a SyntaxError).
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  return next(err);
});

// Central error handler — generic message to clients; details only to logs.
app.use((err, _req, res, _next) => {
  console.error('[error]', config.isProd ? (err && err.message) : err);
  res.status(500).json({ error: 'server_error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`MMR MaterialX API listening on :${PORT} (${config.ENV})`));
}

module.exports = app;
