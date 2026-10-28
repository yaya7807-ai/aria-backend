const express = require('express');
const telemetryRoutes = require('./routes/telemetry');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

app.use(express.json({ limit: '100kb' }));

// CORS sederhana supaya dashboard (React/Vue) di port/domain lain bisa akses API
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (req, res) => res.json({ success: true, service: 'ARIA backend', time: new Date().toISOString() }));

app.use('/api/telemetry', telemetryRoutes);
app.use('/api', dashboardRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Body bukan JSON yang valid' });
  }
  console.error('[ERROR]', err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan di server' });
});

module.exports = app;
