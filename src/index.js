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
// Cloud Run provides PORT; fall back to 8080 for local container tests
const PORT = process.env.PORT ?? 8080;

// ---------- required-environment check -----------------
const requiredEnv = [
  'JWT_SECRET',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'DATABASE_URL',
];
for (const v of requiredEnv) {
  if (!process.env[v]) {
    console.error(`✖ missing required environment variable: ${v}`);
    // exit with non‑zero so Cloud Run clearly logs failure
    process.exit(1);
  }
}

// Sync DB (alter:true will apply model changes such as the new
// "email_vectors" table; in production you may wish to run migrations
// instead of syncing automatically).
sequelize.sync({ alter: true }).then(() => console.log('DB Synced'));

// ── Middleware ───────────────────────────────────────────
app.use(express.json());

// CORS — allow Expo dev client and any origins in ALLOWED_ORIGINS
// `ALLOWED_ORIGINS` is a comma-separated list of prefixes (e.g. ``http://localhost:8081,https://chatmail-…``).
// If the variable is unset or empty we fall back to allowing everything
// (useful for development).  Additionally, setting ALLOW_ALL_ORIGINS=true
// will bypass the check entirely.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const allowAll = true
app.use(
  cors({
    origin: (origin, callback) => {
      console.log('CORS check, origin=', origin, 'allowed list=', allowedOrigins, 'allowAll=', allowAll);
      if (!origin) return callback(null, true);
      if (allowAll) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true);
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
