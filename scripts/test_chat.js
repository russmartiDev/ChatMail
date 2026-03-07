const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('http://localhost:3000/chat/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_token' // adjust or replace with real JWT if needed
      },
      // send the provided prompt for testing per user's request
      body: JSON.stringify({ search_prompt: "Give me summary of message related to bug" })
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch (e) {
    console.error(e);
  }
}

test();