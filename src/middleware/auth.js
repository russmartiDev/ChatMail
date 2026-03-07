// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const store = require('../config/store');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = header.split(' ')[1];
  // allow a hardcoded test token for quick local testing
  if (token === 'test_token') {
    req.user = { id: 'test' };
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await store.findUserById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
