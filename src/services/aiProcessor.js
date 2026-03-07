// src/services/aiProcessor.js
// ─────────────────────────────────────────────────────────
//  Processes raw emails through Gemini Flash 3 (gemini-1.5-flash)
// ─────────────────────────────────────────────────────────

const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyBn5ld06RWXDaJcoZgZcuJ-iJjHRY0SerA");
  return genAI;
}

const SYSTEM_PROMPT = `You are an expert email analyzer. Analyze emails and respond ONLY with a valid JSON object — no markdown, no explanation, no backticks.

Response format:
{
  "category": "urgent" | "event" | "action" | "newsletter" | "finance" | "social" | "info",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "suggestedAction": "summary of action needed (omit if none)",
  "actionItems": ["task 1", "task 2"],
  "replySuggestion": "a concise and professional reply draft if an action is needed (omit if not)",
  "urgencyScore": 1-10,
  "eventDetails": {
    "title": "event name",
    "date": "date string (ISO or readable)",
    "time": "time string",
    "location": "location"
  }
}

Category rules:
- urgent: deadlines, security alerts, account issues, legal, medical, anything requiring immediate attention
- event: meeting invites, calendar events, RSVPs, webinars, appointments
- action: requires a response or task but not immediately urgent
- newsletter: mass emails, marketing, subscriptions, digests
- finance: receipts, invoices, billing, bank statements, payments
- social: social media notifications, friend requests, comments
- info: read-only FYI emails, shipping updates, confirmations

Only include eventDetails if category is "event".
urgencyScore: 1=very low, 10=extremely urgent`;

// ── Process a single email ───────────────────────────────
async function processEmail(email) {
  try {
    const client = getClient();
    // Using gemini-1.5-flash as requested (fast & cost-effective)
    const model = client.getGenerativeModel({ model: "gemini-3-flash-preview" });

    // Clean body limit (Gemini has large context but let's be safe)
    const body = (email.body || email.snippet || '').substring(0, 8000);
    
    const prompt = `
      Subject: ${email.subject}
      From: ${email.from}
      Date: ${email.date}
      Body:
      ${body}
    `;

    const result = await model.generateContent({
       contents: [
         { role: 'user', parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] }
       ],
       generationConfig: { responseMimeType: "application/json" }
    });

    const response = result.response;
    const text = response.text();
    
    // Parse JSON
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse Gemini JSON:', text);
      throw e;
    }

  } catch (error) {
    console.error('Gemini API Error:', error.message);
    // Return a safe fallback object so the pipeline doesn't crash completely
    return {
      category: 'info',
      urgencyScore: 1,
      summary: email.snippet || 'Could not process email.',
      keyPoints: [],
      isProcessed: true
    };
  }
}

// ── Chat with Context ────────────────────────────────────
async function chatWithContext(userPrompt, contextMessages) {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({ model: "gemini-3-flash-preview" });

    let contextText = "No relevant messages found.";
    if (contextMessages && contextMessages.length > 0) {
        contextText = contextMessages.map((msg, i) => `
        --- Message ${i + 1} ---
        ID: ${msg.id}
        From: ${msg.from}
        Subject: ${msg.subject}
        Date: ${msg.received_at}
        Content: ${msg.body || msg.summary || msg.snippet}
        `).join('\n');
    }

    const systemInstruction = `You are ChatMail AI, a helpful assistant that answers questions based on the user's emails and messages.
    Use the provided CONTEXT MESSAGES to answer the user's QUESTION.
    If the context doesn't contain the answer, say so politely.
    Cite the message subject or sender when relevant.
    Keep answers concise and helpful.`;

    const fullPrompt = `
    ${systemInstruction}

    CONTEXT MESSAGES:
    ${contextText}

    USER QUESTION:
    ${userPrompt}
    `;

    const result = await model.generateContent(fullPrompt);
    return result.response.text();

  } catch (error) {
    console.error('Gemini Chat API Error:', error);
    return "I'm having trouble connecting to my brain right now. Please try again later.";
  }
}

// ── Embeddings helper ───────────────────────────────────
async function getEmbedding(text) {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({ model: 'gemini-embedding-001' });
    const resp = await model.embedContent(text);
    // resp.embedding.values is number[]
    return resp.embedding.values;
  } catch (err) {
    console.error('Embedding error:', err);
    throw err;
  }
}

module.exports = { processEmail, chatWithContext, getEmbedding };
