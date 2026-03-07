// src/index.js
// ─────────────────────────────────────────────────────────
//  MailMind Backend — Express Server
// ─────────────────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const gmailRoutes = require('./routes/gmail');
const emailRoutes = require('./routes/emails');
const chatRoutes = require('./routes/chat');
const { sequelize } = require('./config/database');

const app = express();
const PORT = process.env.PORT ?? 3000;

// Sync DB (alter:true will apply model changes such as the new
// "email_vectors" table; in production you may wish to run migrations
// instead of syncing automatically).
sequelize.sync({ alter: true }).then(() => console.log('DB Synced'));

// ── Middleware ───────────────────────────────────────────
app.use(express.json());

// CORS — allow Expo dev client
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((o) => origin.startsWith(o))) return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// Rate limiting
app.use(
  '/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { error: 'Too many requests, please try again later' },
  })
);

app.use(
  '/emails/sync',
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3,
    message: { error: 'Too many sync requests, please wait a moment' },
  })
);

// ── Routes ───────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/auth/gmail', gmailRoutes);
app.use('/emails', emailRoutes);app.use('/chat', chatRoutes);
// ── Health check ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MailMind Backend',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════╗
║   MailMind Backend  ✦          ║
║   Running on port ${PORT}         ║
╚════════════════════════════════╝

Endpoints:
  POST   /auth/register
  POST   /auth/login
  GET    /auth/me
  GET    /auth/gmail/url
  GET    /auth/gmail/callback
  GET    /auth/gmail/status
  DELETE /auth/gmail
  POST   /emails/sync
  GET    /emails
  DELETE /emails
  GET    /health
`);
});
