const { sequelize, User } = require('../src/config/database');

async function listUsers() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB');
    const users = await User.findAll();
    console.log('Users:', JSON.stringify(users, null, 2));
  } catch (e) {
    console.error(e);
  }
}

listUsers();
