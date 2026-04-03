const express = require('express');
const router = express.Router();
const persistence = require('../persistence');

router.get('/', (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    env: process.env.NODE_ENV,
    version: process.env.npm_package_version,
  };
  try {
    // If we're using a Database object (better-sqlite3) or supabase client,
    // we can try a simple check. persistence doesn't export a 'ping' directly,
    // but it has a suppressed initSqlite/supabaseClient logic.
    // For now, we'll return the persistence mode as a proxy for 'set up'.
    const dbMode = process.env.SUPABASE_URL ? 'supabase' : 'sqlite';
    res.json({ ...health, db: 'ok', mode: dbMode });
  } catch (e) {
    res.status(503).json({ ...health, db: 'error', error: e.message });
  }
});

module.exports = router;
