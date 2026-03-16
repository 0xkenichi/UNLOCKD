// scripts/discover-all.js
require('dotenv').config({ path: 'packages/backend/.env' });
const SovereignDataService = require('../packages/backend/lib/SovereignDataService');
const persistence = require('../packages/backend/persistence');

async function main() {
  console.log('🚀 Starting Global Vesting Discovery...');
  console.log('CWD:', process.cwd());
  try {
    await persistence.init();
    console.log('Persistence initialized. Starting sync...');
    await SovereignDataService.syncAllTokenomistData();
    console.log('✅ Master Archival process completed.');
  } catch (err) {
    console.error('❌ Discovery failed:', err.message);
  } finally {
    process.exit(0);
  }
}

main();
