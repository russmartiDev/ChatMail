const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /chat/search
// ───────────────────────────────────────────────────────────
// This route forwards the user's prompt directly to the external webhook
// and relays its response. Only a single HTTP call is made.
//
// NOTE: the webhook now expects a POST with a JSON body containing the
// `chat` field.  we continue to accept a POST from the client, but the
// back‑end forwards it in the same format.
router.post('/search', requireAuth, async (req, res) => {
  const { search_prompt } = req.body;

  if (!search_prompt) {
    return res.status(400).json({ error: 'search_prompt is required' });
  }

  try {
    console.log(`Forwarding chat prompt to webhook: "${search_prompt}"`);

    const webhookUrl = 'https://n8n.stateandliberty.com/webhook/ae9377b4-717e-4ab6-8895-583eeae0aada';

    const outboundBody = { chat: search_prompt };

    const webhookResp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outboundBody)
    });

    if (!webhookResp.ok) {
      const errText = await webhookResp.text();
      console.error('Webhook Error:', errText);
      return res.status(502).json({ error: 'Failed to contact webhook', details: errText });
    }

    // assume the webhook returns a plain text answer or JSON; pass through directly
    let answer;
    const contentType = webhookResp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      answer = await webhookResp.json();
      // if the webhook returns an object with a `response` string, flatten it
      if (answer && typeof answer === 'object' && typeof answer.response === 'string') {
        answer = answer.response;
      }
    } else {
      answer = await webhookResp.text();
    }

    res.json({ answer });
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
