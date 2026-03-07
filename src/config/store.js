// src/config/store.js
// ─────────────────────────────────────────────────────────
//  Persistent store backed by Sequelize (Postgres only).
// ─────────────────────────────────────────────────────────

const { User, EmailBatch } = require('./database');

const store = {
  // ── Users ──────────────────────────────────────────────
  async createUser(id, userData) {
    try {
      const user = await User.create({
        id,
        email: userData.email,
        name: userData.name,
        passwordHash: userData.passwordHash,
        gmailConnected: userData.gmailConnected || false,
      });
      return user.toJSON();
    } catch (err) {
      console.error('Error creating user:', err);
      throw err;
    }
  },

  async findUserById(id) {
    const user = await User.findByPk(id);
    if (!user) return null;
    const userData = user.toJSON();
    // Ensure gmailConnected is true if tokens exist, even if flag is false
    if (userData.gmailTokens && Object.keys(userData.gmailTokens).length > 0) {
        userData.gmailConnected = true;
    }
    return userData;
  },

  async findUserByEmail(email) {
    const user = await User.findOne({ where: { email } });
    if (!user) return null;
    const userData = user.toJSON();
    if (userData.gmailTokens && Object.keys(userData.gmailTokens).length > 0) {
        userData.gmailConnected = true;
    }
    return userData;
  },

  async updateUser(id, updates) {
    const user = await User.findByPk(id);
    if (!user) return null;

    // Apply updates
    if (updates.gmailTokens) user.gmailTokens = updates.gmailTokens;
    if (updates.gmailEmail) user.gmailEmail = updates.gmailEmail;
    if (updates.gmailName) user.gmailName = updates.gmailName;
    if (updates.gmailPicture) user.gmailPicture = updates.gmailPicture;
    if (updates.gmailConnected !== undefined) user.gmailConnected = updates.gmailConnected;
    if (updates.discordToken !== undefined) user.discordToken = updates.discordToken;
    if (updates.discordWebhookUrl !== undefined) user.discordWebhookUrl = updates.discordWebhookUrl;
    if (updates.discordChannelId !== undefined) user.discordChannelId = updates.discordChannelId;

    if (updates.gmailConnected) {
       user.gmailConnectedAt = new Date();
    }

    await user.save();
    return user.toJSON();
  },

  // ── Gmail tokens ────────────────────────────────────────
  async saveGmailTokens(userId, tokens) {
    const user = await User.findByPk(userId);
    if (!user) return;
    user.gmailTokens = tokens;
    user.gmailConnected = true;
    user.gmailConnectedAt = new Date();
    await user.save();
  },

  async removeGmailTokens(userId) {
    const user = await User.findByPk(userId);
    if (!user) return;
    user.gmailTokens = null;
    user.gmailConnected = false;
    user.gmailConnectedAt = null;
    user.gmailEmail = null;
    user.gmailName = null;
    user.gmailPicture = null;
    await user.save();
  },

  // ── Email summaries ─────────────────────────────────────
  async saveEmailBatch(userId, batch) {
    try {
      const [record, created] = await EmailBatch.findOrCreate({
        where: { userId },
        defaults: { data: batch }
      });
      
      if (!created) {
        record.data = batch;
        await record.save();
      }
    } catch (err) {
      console.error('Error saving email batch:', err);
      throw err;
    }
  },

  async getEmailBatch(userId) {
    const record = await EmailBatch.findByPk(userId);
    return record ? record.data : null;
  },

  async clearEmailBatch(userId) {
    await EmailBatch.destroy({ where: { userId } });
  },
};

module.exports = store;
