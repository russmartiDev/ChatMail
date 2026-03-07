// scripts/embed_emails.js
// ─────────────────────────────────────────────────────────
//  Recreate the `email_vectors` table with Postgres vector type and
//  generate RAG-friendly rows using Gemini before embedding.
//
//  The table schema is:
//    id TEXT PRIMARY KEY
//    content TEXT NOT NULL
//    metadata JSONB
//    embedding VECTOR(3072) NOT NULL
//
//  WARNING: dropping the existing table will erase any stored vectors.
//
//  Usage:
//      cd mailmind-backend
//      node scripts/embed_emails.js

require('dotenv').config();
const { sequelize, Email } = require('../src/config/database');
const { getEmbedding } = require('../src/services/aiProcessor');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function formatForRAG(email) {
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  const prompt = `Produce a concise, factual summary of the following email suitable for retrieval-augmented generation (include subject, sender, date, and main points):

Subject: ${email.subject}
From: ${email.from}
Date: ${email.received_at}

${email.body || email.snippet || ''}`;
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return result.response.text().trim();
}

async function main() {
  try {
    console.log('Authenticating with database...');
    await sequelize.authenticate();

    // prepare vector extension and recreate table
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS vector');
    await sequelize.query('DROP TABLE IF EXISTS email_vectors');
    await sequelize.query(`
      CREATE TABLE email_vectors (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata JSONB,
        embedding VECTOR(3072) NOT NULL
      )
    `);
    console.log('email_vectors table recreated');

    const emails = await Email.findAll();
    console.log(`Found ${emails.length} emails`);

    for (const email of emails) {
      const ragText = await formatForRAG(email);
      const metadata = {
        id: email.id,
        userId: email.userId,
        subject: email.subject,
        from: email.from,
        to: email.to,
        received_at: email.received_at,
      };

      console.log(`Embedding email ${email.id}...`);
      let embedding;
      try {
        embedding = await getEmbedding(ragText);
      } catch (err) {
        console.error('Failed to get embedding for', email.id, err);
        continue;
      }

      // Postgres vector type expects input like "[v1,v2,...]"
      const vecLiteral = '[' + embedding.join(',') + ']';

      await sequelize.query(
        `INSERT INTO email_vectors (id, content, metadata, embedding)
         VALUES ($1,$2,$3,$4)`,
        { bind: [email.id, ragText, metadata, vecLiteral] }
      );
      console.log(`Stored vector for ${email.id}`);
    }

    console.log('Done embedding emails');
  } catch (err) {
    console.error('Error in embedding script:', err);
  } finally {
    await sequelize.close();
  }
}

main();
