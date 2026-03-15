const relayer = require('./packages/backend/relayer/SovereignRelayer');
const persistence = require('./packages/backend/persistence');

async function test() {
  console.log('--- Starting Sovereign Relayer Verification ---');
  await persistence.init();
  
  const testWallet = '0x1234567890123456789012345678901234567890';
  console.log(`--- Seeding Test Data for ${testWallet} ---`);
  
  // Insert a test loan to make the wallet "active"
  const db = persistence.getSqlite();
  db.prepare(`
    INSERT OR IGNORE INTO user_loans (id, wallet_address, amount, status)
    VALUES (?, ?, ?, ?)
  `).run('test-loan-1', testWallet, '1000', 'active');

  // Start the relayer
  await relayer.start();
  
  // Run one pulse manually
  console.log('--- Triggering Manual Pulse ---');
  await relayer.pulse();
  
  // Check if anything was mirrored
  const sources = db.prepare('SELECT * FROM vesting_sources WHERE lockup_address = ?').all(testWallet);
  console.log('--- Mirrored Assets in DB ---');
  console.log(JSON.stringify(sources, null, 2));

  await relayer.stop();
  process.exit(0);
}

test().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
