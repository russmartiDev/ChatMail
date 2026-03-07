const { Email, sequelize } = require('../src/config/database');

async function checkEmail() {
  try {
    await sequelize.authenticate();
    const email = await Email.findOne({ where: { id: '19cc50745c94eabe' } });
    if (email) {
      console.log('Summary column:', email.summary);
      console.log('KeyPoints column:', JSON.stringify(email.keyPoints, null, 2));
      console.log('SuggestedAction column:', email.suggestedAction);
      console.log('Category:', email.category);
    } else {
      console.log('Email not found');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
}

checkEmail();