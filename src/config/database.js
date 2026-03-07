const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// The backend uses PostgreSQL exclusively.  A valid
// DATABASE_URL must be supplied via the environment; there is no
// longer any fallback to SQLite or other dialects.
//
// Example connection string format:
//   postgres://user:pass@host:5432/dbname?sslmode=require

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set; PostgreSQL is required.');
}

// Configure Sequelize for Postgres only
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false, // console.log to see SQL
  dialectOptions: {
    // allow SSL
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

// The models remain the same; only the database engine has changed.
// Define User model
const User = sequelize.define('User', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  gmailConnected: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  gmailTokens: {
    type: DataTypes.JSON, // Stores tokens as JSON
    allowNull: true,
  },
  gmailEmail: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  gmailName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  gmailPicture: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  gmailConnectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Discord Integration
  discordToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  discordChannelId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  discordWebhookUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

// Define EmailBatch model
const EmailBatch = sequelize.define('EmailBatch', {
  userId: {
    type: DataTypes.STRING,
    primaryKey: true, // One batch per user for now, or use composite key if multiple batches
  },
  data: {
    type: DataTypes.JSON,
    allowNull: false,
  },
});

// Define Email model (existing table)
const Email = sequelize.define('Email', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true, // Gmail message ID
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  source: {
    type: DataTypes.STRING, // 'email' | 'discord'
    allowNull: false,
    defaultValue: 'email',
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '(No Subject)',
  },
  body: {
    type: DataTypes.TEXT, // Using TEXT for longer content
    allowNull: true,
  },
  received_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  snippet: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  from: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  to: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // AI Analyzed Fields
  category: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  keyPoints: {
    type: DataTypes.JSON, // Stores array of strings
    allowNull: true,
  },
  urgencyScore: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  suggestedAction: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  actionItems: {
    type: DataTypes.JSON, // Stores array of { text: string, done: boolean }
    allowNull: true,
  },
  replySuggestion: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  eventDetails: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  isProcessed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

// (EmailVector model removed — the table is managed manually in scripts
// using Postgres vector extension to support `vector(3072)` type.)

// Relationships
User.hasMany(Email, { foreignKey: 'userId' });
Email.belongsTo(User, { foreignKey: 'userId' });

// Sync database
// sequelize.sync({ alter: true }).then(() => {
//   console.log('Database synced');
// });

// We don't want to close the connection here because this file is required by the app
// AND by the scripts. The script should handle closing its own connection.

module.exports = {
  sequelize,
  User,
  EmailBatch,
  Email,
  // no EmailVector export – use raw queries or scripts that create the table
};
