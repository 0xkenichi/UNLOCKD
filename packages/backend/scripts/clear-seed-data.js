
require('dotenv').config();
const persistence = require('../persistence');

async function clearData() {
    console.log('[clear] Initializing persistence...');
    await persistence.init();
    
    console.log('[clear] Deleting seeded mock tokens and unlock events...');
    
    // Using a direct SQL query through sqlite if available, or just clear the tables.
    // persistence.js doesn't have a clearAllUnlockEvents, but we can use the SQLite instance.
    
    const db = persistence.sqlite || require('better-sqlite3')(process.env.INDEXER_DB_PATH || 'data/indexer.sqlite');
    
    try {
        db.prepare('DELETE FROM token_unlock_events').run();
        db.prepare('DELETE FROM token_projects').run();
        console.log('[clear] Tables token_unlock_events and token_projects cleared.');
    } catch (err) {
        console.error('[clear] Failed to clear tables:', err.message);
    }
    
    process.exit(0);
}

clearData().catch(err => {
    console.error('[clear] Failed:', err);
    process.exit(1);
});
