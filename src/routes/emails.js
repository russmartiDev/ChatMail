// src/routes/emails.js
// ─────────────────────────────────────────────────────────
//  POST /emails/sync    — fetch Gmail + run AI, cache result
//  GET  /emails         — return cached processed emails
//  DELETE /emails       — clear cached emails
// ─────────────────────────────────────────────────────────

const express = require('express');
const { Email } = require('../config/database');
const store = require('../config/store');
const { requireAuth } = require('../middleware/auth');
// const { fetchEmails } = require('../services/gmailFetcher');
// const { processEmails } = require('../services/aiProcessor');

const router = express.Router();

// ── Sync emails ──────────────────────────────────────────
router.post('/sync', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const user = await store.findUserById(userId);

  if (!user.gmailConnected || !user.gmailTokens) {
    return res.status(400).json({
      error: 'Gmail not connected',
      code: 'GMAIL_NOT_CONNECTED',
    });
  }

  try {
    // Fetch emails from the database (populated by external script)
    const emails = await Email.findAll({
      where: { userId },
      order: [['received_at', 'DESC']],
      limit: 50
    });

    const processedEmails = emails.map(e => ({
      id: e.id,
      source: e.source || 'email',
      category: e.category || 'info', 
      from: e.from || 'Unknown',
      date: e.received_at,
      subject: e.subject,
      snippet: e.snippet || '',
      body: e.body || '',
      summary: e.summary || e.snippet || '', 
      urgencyScore: e.urgencyScore || 1,
      keyPoints: e.keyPoints || [],
      suggestedAction: e.suggestedAction || '',
      actionItems: e.actionItems || [],
      replySuggestion: e.replySuggestion || '',
      eventDetails: e.eventDetails || null
    }));

    // Initialize batch with empty arrays for all categories
    const batch = {
      totalCount: processedEmails.length,
      processedAt: new Date().toISOString(),
      urgent: [],
      event: [],
      action: [],
      finance: [],
      newsletter: [],
      social: [],
      info: [],
    };

    // Distribute emails into categories
    processedEmails.forEach(email => {
      const cat = email.category;
      if (batch[cat]) {
        batch[cat].push(email);
      } else {
        // Fallback if category is unknown or missing
        batch.info.push(email);
      }
    });

    res.json({ success: true, batch });
  } catch (err) {
    console.error('Error fetching emails from DB:', err);
    res.status(500).json({ error: 'Failed to retrieve emails' });
  }
});

// ── Get cached emails ────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const emails = await Email.findAll({
      where: { userId },
      order: [['received_at', 'DESC']],
      limit: 50
    });

    const processedEmails = emails.map(e => ({
      id: e.id,
      source: e.source || 'email',
      category: e.category || 'info',
      from: e.from || 'Unknown',
      date: e.received_at,
      subject: e.subject,
      snippet: e.snippet || '',
      body: e.body || '',
      summary: e.summary || e.snippet || '',
      urgencyScore: e.urgencyScore || 1,
      keyPoints: e.keyPoints || [],
      suggestedAction: e.suggestedAction || '',
      actionItems: e.actionItems || [],
      replySuggestion: e.replySuggestion || '',
      eventDetails: e.eventDetails || null
    }));

    // Initialize batch with empty arrays for all categories
    const batch = {
      totalCount: processedEmails.length,
      processedAt: new Date().toISOString(),
      urgent: [],
      event: [],
      action: [],
      finance: [],
      newsletter: [],
      social: [],
      info: [],
    };

    // Distribute emails into categories
    processedEmails.forEach(email => {
      const cat = email.category;
      if (batch[cat]) {
        batch[cat].push(email);
      } else {
        // Fallback if category is unknown or missing
        batch.info.push(email);
      }
    });

    res.json({ batch });
  } catch (err) {
    console.error('Error fetching emails from DB:', err);
    res.status(500).json({ error: 'Failed to retrieve emails' });
  }
});

// ── Clear cached emails ──────────────────────────────────
router.delete('/', requireAuth, async (req, res) => {
  await store.clearEmailBatch(req.user.id);
  res.json({ success: true });
});

// ── Update email (e.g. toggle action item) ───────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { actionItems } = req.body;
    const userId = req.user.id;

    const email = await Email.findOne({ where: { id, userId } });
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (actionItems) {
      email.actionItems = actionItems;
    }

    await email.save();
    res.json({ success: true, email });
  } catch (err) {
    console.error('Error updating email:', err);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

module.exports = router;
