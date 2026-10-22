require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

// request logger (tiny)
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'mmr-materialx' }));

app.use('/auth', require('./routes/auth'));
app.use('/categories', require('./routes/categories'));
app.use('/listings', require('./routes/listings'));
app.use('/', require('./routes/users')); // /me

// central error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'server_error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`MMR MaterialX API listening on :${PORT}`));
}

module.exports = app;
