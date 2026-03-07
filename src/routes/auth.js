// src/routes/auth.js
// ─────────────────────────────────────────────────────────
//  POST /auth/register   — create account with email+password
//  POST /auth/login      — login, returns JWT
//  GET  /auth/me         — get current user profile
// ─────────────────────────────────────────────────────────

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const store = require('../config/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function sanitizeUser(user) {
  const { passwordHash, gmailTokens, ...safe } = user;
  
  // Ensure gmailConnected reflects if tokens actually exist
  if (gmailTokens && Object.keys(gmailTokens).length > 0) {
    safe.gmailConnected = true;
  }
  
  return safe;
}

// ── Register ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, and name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await store.findUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await store.createUser(uuidv4(), {
      email: email.toLowerCase(),
      name,
      passwordHash,
      gmailConnected: false,
    });

    const token = generateToken(user.id);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── Login ────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await store.findUserByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Get current user ─────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

// ── Discord Configuration ────────────────────────────────
router.post('/discord', requireAuth, async (req, res) => {
  try {
    const { token, webhookUrl } = req.body;
    
    if (!token || !webhookUrl) {
        return res.status(400).json({ error: 'Token and Webhook URL required' });
    }

    // Extract Channel ID from Webhook URL
    // Webhook URL format: https://discord.com/api/webhooks/{id}/{token}
    // We can fetch the webhook object to get the channel_id
    let channelId = null;
    try {
        const webhookRes = await fetch(webhookUrl);
        if (!webhookRes.ok) throw new Error('Invalid Webhook');
        const webhookData = await webhookRes.json();
        channelId = webhookData.channel_id;
    } catch (e) {
        console.error('Failed to resolve webhook:', e);
        return res.status(400).json({ error: 'Invalid Webhook URL' });
    }

    await store.updateUser(req.user.id, {
        discordToken: token,
        discordWebhookUrl: webhookUrl,
        discordChannelId: channelId
    });

    res.json({ success: true, message: 'Discord configured', channelId });
  } catch (err) {
    console.error('Discord config error:', err);
    res.status(500).json({ error: 'Failed to save Discord config' });
  }
});

router.get('/discord/status', requireAuth, async (req, res) => {
  try {
    const user = await store.findUserById(req.user.id);
    res.json({ 
        connected: !!(user.discordToken && user.discordChannelId),
        channelId: user.discordChannelId,
        webhookUrl: user.discordWebhookUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed' });
  }
});

router.delete('/discord', requireAuth, async (req, res) => {
  try {
    await store.updateUser(req.user.id, {
        discordToken: null,
        discordChannelId: null,
        discordWebhookUrl: null
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect Discord' });
  }
});

module.exports = router;
