// scripts/fetch_emails.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Load .env from parent directory regardless of CWD
const { User, Email, sequelize } = require('../src/config/database');
const { fetchEmails } = require('../src/services/gmailFetcher');
const { processEmail } = require('../src/services/aiProcessor');
const { cleanBodyText } = require('../src/services/emailCleaner');

async function main() {
  try {
    // Wait for DB sync to complete before starting
    await sequelize.authenticate();
    // Sync specifically the Email model to add new columns if needed
    // await Email.sync({ alter: true });
    // await User.sync({ alter: true }); // Sync User to add new columns (e.g. discordWebhookUrl)
    console.log('Database connected.');
    
    console.log('Starting email fetch & process script...');
    
    // Find all users with connected Gmail accounts
    const users = await User.findAll({
      where: {
        gmailConnected: true,
      },
    });

    if (users.length === 0) {
      console.log('No users with connected Gmail accounts found.');
      return;
    }

    // checking for new emails...
    // console.log('Clearing existing emails from database...');
    // for (const user of users) {
    //     await Email.destroy({ where: { userId: user.id } });
    // }
    // console.log('Database cleared.');

    console.log(`Found ${users.length} users to process.`);

    for (const user of users) {
      if (!user.gmailTokens) {
        console.log(`User ${user.email} has no tokens, skipping.`);
        continue;
      }

      console.log(`Fetching emails for user: ${user.email}`);

      try {
        // Fetch 10 latest emails
        // Limit is passed as 3rd argument
        const emails = await fetchEmails(user.gmailTokens, 'in:inbox', 10);
        
        console.log(`Fetched ${emails.length} emails. Processing with Gemini and saving...`);

        for (const email of emails) {
          // Check if already exists
          const existing = await Email.findOne({ where: { id: email.id, userId: user.id } });
          if (existing) {
              console.log(`Skipping existing email: ${email.id}`);
              continue;
          }

          // Clean up body
          if (email.body) {
            email.body = cleanBodyText(email.body);
            // Debug: Log cleaned body preview
            console.log(`Cleaned body preview: ${email.body.substring(0, 100)}...`);
          }

          // Process with AI
          let processed = null;
          try {
             console.log(`Analyzing email: ${email.subject.substring(0, 40)}...`);
             processed = await processEmail(email);
          } catch (aiErr) {
             console.error('AI Processing error:', aiErr.message);
             // Fallback to basic data
             processed = {
               summary: email.snippet,
               category: 'info',
               urgencyScore: 1
             };
          }

          // Parse date
          let receivedAt = new Date();
          if (email.date) {
            receivedAt = new Date(email.date);
            if (isNaN(receivedAt.getTime())) {
                receivedAt = new Date(); // Fallback if invalid date
            }
          }

          // Upsert email with AI data
          await Email.upsert({
            id: email.id,
            userId: user.id,
            subject: email.subject,
            body: email.body,
            received_at: receivedAt,
            snippet: email.snippet,
            from: email.from,
            to: email.to,
            // AI Fields
            category: processed.category,
            summary: email.body || email.snippet,
            keyPoints: processed.keyPoints,
            urgencyScore: processed.urgencyScore,
            suggestedAction: processed.suggestedAction,
            actionItems: processed.actionItems ? processed.actionItems.map(text => ({ text, done: false })) : [],
            replySuggestion: processed.replySuggestion,
            eventDetails: processed.eventDetails,
            isProcessed: true
          });

          // Notify Discord if Urgent
          if (processed.category === 'urgent' && user.discordWebhookUrl) {
              await notifyDiscord(user.discordWebhookUrl, processed, email);
          }
        }
        
        console.log(`Successfully processed and saved emails for ${user.email}.`);

      } catch (err) {
        console.error(`Error processing user ${user.email}:`, err.message);
        // Continue to next user
      }
    }

    console.log('Done.');
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    // Close DB connection
    await sequelize.close();
  }
}

// Run main function
main();

async function notifyDiscord(webhookUrl, processed, email) {
    try {
        const payload = {
            embeds: [{
                title: `🚨 Urgent Email: ${email.subject}`,
                description: processed.summary,
                color: 15548997, // Red
                fields: [
                    { name: 'From', value: email.from, inline: true },
                    { name: 'Action', value: processed.suggestedAction || 'Review immediately', inline: true },
                    { name: 'Key Points', value: processed.keyPoints?.map(p => `• ${p}`).join('\n') || 'None' }
                ],
                timestamp: new Date().toISOString()
            }]
        };

        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log('Sent Discord notification.');
    } catch (e) {
        console.error('Failed to send Discord notification:', e.message);
    }
}
