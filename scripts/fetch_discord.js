// scripts/fetch_discord.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Client, GatewayIntentBits } = require('discord.js');
const { User, Email, sequelize } = require('../src/config/database');
const { processEmail } = require('../src/services/aiProcessor'); // Reusing processEmail for now, rename to processMessage ideally

async function main() {
  try {
    await sequelize.authenticate();
    
    // Schema is already up to date; no need to call sync({ alter: true })
    // await Email.sync({ alter: false }); 
    // await User.sync({ alter: false });
    
    console.log('Database connected.');

    // Find users with Discord configured
    const users = await User.findAll({
      where: sequelize.where(sequelize.col('discordToken'), 'IS NOT', null),
    });

    if (users.length === 0) {
      console.log('No users with Discord configured found.');
      return;
    }

    console.log(`Found ${users.length} users with Discord configured.`);

    for (const user of users) {
      if (!user.discordToken || !user.discordChannelId) {
        console.log(`User ${user.email} missing complete Discord config.`);
        continue;
      }

      console.log(`Fetching Discord messages for user: ${user.email}`);
      
      const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
      
      try {
        await client.login(user.discordToken);
        
        let channel;
        try {
            channel = await client.channels.fetch(user.discordChannelId);
        } catch (fetchErr) {
            console.error(`Failed to fetch channel ${user.discordChannelId}: ${fetchErr.message}`);
            if (fetchErr.code === 50001) { // Missing Access
                console.error('Make sure the Bot is invited to the server and has "View Channel" permissions.');
            }
            throw fetchErr;
        }
        
        if (!channel || !channel.isTextBased()) {
             console.log(`Invalid channel ID ${user.discordChannelId} for user ${user.email}`);
             client.destroy();
             continue;
        }

        // Fetch last 10 messages
        let messages;
        try {
            messages = await channel.messages.fetch({ limit: 10 });
        } catch (msgErr) {
             console.error(`Failed to fetch messages in channel ${channel.name}: ${msgErr.message}`);
             if (msgErr.code === 50001) {
                 console.error('Make sure the Bot has "Read Message History" permissions in this channel.');
             }
             throw msgErr;
        }

        console.log(`Fetched ${messages.size} Discord messages.`);

        for (const msg of messages.values()) {
             if (msg.author.bot) continue; // Skip bots

             const content = msg.content;
             if (!content) continue;

             // Check if already processed
             const existing = await Email.findOne({ where: { id: msg.id } });
             if (existing) continue;

             console.log(`Processing message: ${content.substring(0, 30)}...`);

             // Adapt message to AI processor format
             const messageData = {
                 id: msg.id,
                 subject: `Discord: ${content.substring(0, 30)}...`, // Fake subject
                 body: content,
                 snippet: content.substring(0, 100),
                 from: msg.author.username,
                 date: msg.createdAt,
                 to: channel.name
             };

             let processed = null;
             try {
                processed = await processEmail(messageData);
             } catch (aiErr) {
                console.error('AI Processing error:', aiErr.message);
                 processed = {
                   summary: content,
                   category: 'social',
                   urgencyScore: 1,
                   keyPoints: [],
                   suggestedAction: '',
                   actionItems: [],
                   replySuggestion: '',
                   eventDetails: null
                 };
             }

             await Email.create({
                id: msg.id,
                userId: user.id,
                source: 'discord',
                subject: messageData.subject,
                body: messageData.body,
                received_at: messageData.date,
                snippet: messageData.snippet,
                from: messageData.from,
                to: messageData.to,
                // AI Fields
                category: processed.category,
                summary: processed.summary || processed.snippet,
                keyPoints: processed.keyPoints,
                urgencyScore: processed.urgencyScore,
                suggestedAction: processed.suggestedAction,
                actionItems: processed.actionItems ? processed.actionItems.map(text => ({ text, done: false })) : [],
                replySuggestion: processed.replySuggestion,
                eventDetails: processed.eventDetails,
                isProcessed: true
             });
        }

        console.log(`Successfully processed Discord messages for ${user.email}`);
        client.destroy();

      } catch (err) {
        if (err.message.includes('disallowed intents')) {
          console.error(`\n❌ ERROR: Disallowed Intents`);
          console.error(`You must enable "Message Content Intent" in the Discord Developer Portal for your bot.`);
          console.error(`Go to https://discord.com/developers/applications > Your App > Bot > Privileged Gateway Intents > Toggle "Message Content Intent" ON.\n`);
        }
        console.error(`Error processing Discord for user ${user.email}:`, err.message);
        if (client) client.destroy();
      }
    }

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    // We don't close sequelize here because the loop might be running multiple clients? 
    // Actually we should, after loop.
    await sequelize.close();
  }
}

main();