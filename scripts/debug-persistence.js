// scripts/debug-persistence.js
require('dotenv').config({ path: 'packages/backend/.env' });
const persistence = require('../packages/backend/persistence');

async function main() {
  console.log('Testing persistence init...');
  await persistence.init();
  console.log('Persistence initialized.');
  
  console.log('Testing saveTokenProject...');
  await persistence.saveTokenProject({
    id: 'test-token',
    name: 'Test Token',
    symbol: 'TEST',
    description: 'A test token',
    category: 'Test'
  });
  console.log('✅ saveTokenProject worked.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
