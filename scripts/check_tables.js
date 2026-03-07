// Print a list of tables/schemas for whichever backend is active.
// Previously this script used sqlite3 directly; now it works via
// Sequelize so it will also function against a Postgres connection.

const { sequelize } = require('../src/config/database');

async function listTables() {
  try {
    await sequelize.authenticate();
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    console.log('Tables:');
    tables.forEach(t => console.log(t));
  } catch (err) {
    console.error('error listing tables', err);
  } finally {
    await sequelize.close();
  }
}

listTables();
