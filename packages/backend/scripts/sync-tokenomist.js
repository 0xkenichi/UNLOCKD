
require('dotenv').config();
const persistence = require('../persistence');
const SovereignDataService = require('../lib/SovereignDataService');

async function runSync() {
    console.log('[sync] Initializing persistence...');
    await persistence.init();
    
    console.log('[sync] Starting Tokenomist data sync...');
    await SovereignDataService.syncAllTokenomistData();
    
    console.log('[sync] Sync complete.');
    process.exit(0);
}

runSync().catch(err => {
    console.error('[sync] Sync failed:', err);
    process.exit(1);
});
