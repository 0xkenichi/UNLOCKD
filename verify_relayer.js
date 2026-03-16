const relayer = require('./packages/backend/relayer/SovereignRelayer');
const persistence = require('./packages/backend/persistence');

async function test() {
  console.log('--- Starting Sovereign Relayer Verification ---');
  await persistence.init();
  
  // No dummy wallet seeding. The relayer should pulse based on existing data in the DB.
  console.log('--- Scanning DB for existing active wallets ---');

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
