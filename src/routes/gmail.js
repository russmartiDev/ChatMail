// src/routes/gmail.js
// ─────────────────────────────────────────────────────────
//  GET  /auth/gmail/url       — get Google OAuth URL to open in browser
//  GET  /auth/gmail/callback  — Google redirects here with code
//  DELETE /auth/gmail         — disconnect Gmail
//  GET  /auth/gmail/status    — check if Gmail is connected
// ─────────────────────────────────────────────────────────

const express = require('express');
const { google } = require('googleapis');
const store = require('../config/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Temporary state store to link OAuth callback back to a user
// In production use Redis or a DB
const pendingOAuth = new Map(); // state → userId

// ── Get OAuth URL ────────────────────────────────────────
router.get('/url', requireAuth, (req, res) => {
  const oauth2Client = getOAuthClient();
  const state = `${req.user.id}_${Date.now()}`;
  pendingOAuth.set(state, req.user.id);

  // Clean up old pending states (older than 10 minutes)
  for (const [key] of pendingOAuth) {
    const ts = parseInt(key.split('_')[1]);
    if (Date.now() - ts > 600000) pendingOAuth.delete(key);
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state,
  });

  res.json({ url });
});

// ── OAuth Callback ───────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.send(`
      <html><body>
        <script>window.close();</script>
        <p>Authorization failed: ${error}. You can close this window.</p>
      </body></html>
    `);
  }

  const userId = pendingOAuth.get(state);
  if (!userId) {
    return res.status(400).send('<html><body><p>Invalid or expired state. Please try again.</p></body></html>');
  }
  pendingOAuth.delete(state);

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: googleUser } = await oauth2.userinfo.get();

    // Save tokens + Gmail info to user
    await store.saveGmailTokens(userId, tokens);
    await store.updateUser(userId, {
      gmailEmail: googleUser.email,
      gmailName: googleUser.name,
      gmailPicture: googleUser.picture,
    });

    // Success — close the browser window, app will poll for status
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0A0A0F; color: white;">
          <h2>✅ Gmail Connected!</h2>
          <p style="color: #9CA3AF;">You can close this window and return to MailMind.</p>
          <script>
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Gmail callback error:', err);
    res.status(500).send('<html><body><p>Failed to connect Gmail. Please try again.</p></body></html>');
  }
});

// ── Disconnect Gmail ─────────────────────────────────────
router.delete('/', requireAuth, async (req, res) => {
  await store.removeGmailTokens(req.user.id);
  await store.clearEmailBatch(req.user.id);
  res.json({ success: true, message: 'Gmail disconnected' });
});

// ── Gmail connection status ──────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  const user = await store.findUserById(req.user.id);
  res.json({
    connected: user.gmailConnected ?? false,
    gmailEmail: user.gmailEmail ?? null,
  });
});

module.exports = router;
