const { sequelize } = require('../src/config/database');

// This helper prints the schema information for the Users table.  It
// uses `describeTable` which works across SQLite, Postgres, etc.
//
// To check a different table, pass a different name or hook this into
// the Sequelize CLI later.
async function checkSchema() {
  try {
    await sequelize.authenticate();
    const info = await sequelize.getQueryInterface().describeTable('Users');
    console.log(info);
  } catch (e) {
    console.error('Failed to fetch schema:', e);
  } finally {
    await sequelize.close();
  }
}

checkSchema();
