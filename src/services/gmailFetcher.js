// src/services/gmailFetcher.js
// ─────────────────────────────────────────────────────────
//  Fetches emails from Gmail API using stored OAuth tokens
// ─────────────────────────────────────────────────────────

const { google } = require('googleapis');

const EMAIL_FETCH_LIMIT = 30;

function getAuthClient(tokens) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

// ── Fetch all emails ─────────────────────────────────────
async function fetchEmails(tokens, query = 'in:inbox newer_than:3d', limit = 30) {
  const auth = getAuthClient(tokens);
  const gmail = google.gmail({ version: 'v1', auth });

  // Get message IDs
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: limit,
    q: query,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return [];

  // Fetch each message in parallel
  const results = await Promise.allSettled(
    messages.map((m) => fetchEmailById(gmail, m.id))
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
}

// ── Fetch single email ───────────────────────────────────
async function fetchEmailById(gmail, id) {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id,
    format: 'full',
  });

  const msg = res.data;
  const headers = msg.payload?.headers ?? [];
  const header = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const body = extractBody(msg.payload);

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: header('Subject') || '(No Subject)',
    from: header('From'),
    to: header('To'),
    date: header('Date'),
    snippet: msg.snippet ?? '',
    body: body.slice(0, 4000), // cap for AI context
    labelIds: msg.labelIds ?? [],
  };
}

// ── Helper to strip HTML tags ────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<style([\s\S]*?)<\/style>/gi, '')
    .replace(/<script([\s\S]*?)<\/script>/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Extract plain text body from MIME payload ────────────
function extractBody(payload) {
  if (!payload) return '';

  // 1. If it has direct body data (Single part message)
  if (payload.body?.data) {
    const text = base64Decode(payload.body.data);
    if (payload.mimeType === 'text/html') {
      return stripHtml(text);
    }
    return text;
  }

  // 2. If it has parts (Multipart message)
  if (payload.parts) {
    // Prefer text/plain
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain?.body?.data) return base64Decode(plain.body.data);

    // Fallback text/html — strip tags
    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      return stripHtml(base64Decode(htmlPart.body.data));
    }

    // Recurse nested parts
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

function base64Decode(data) {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

module.exports = { fetchEmails };
