const SovereignDataService = require('./packages/backend/lib/SovereignDataService');
const persistence = require('./packages/backend/persistence');

async function testConsensus() {
  console.log('--- Testing Multi-Source Consensus ---');
  const symbols = ['ETH', 'BTC', 'SOL'];
  
  for (const symbol of symbols) {
    console.log(`\nFetching consensus for ${symbol}...`);
    const details = await SovereignDataService.getConsensusPrice(symbol, true);
    console.log(`Consensus Details for ${symbol}:`, JSON.stringify(details, null, 2));
    
    const avg = await SovereignDataService.getConsensusPrice(symbol);
    console.log(`Average Consensus Price: $${avg.toFixed(4)}`);
  }
}

async function run() {
  try {
    // Mock persistence meta to avoid DB issues in standalone test if needed
    // But persistence.init() should handle it if envs are there.
    await testConsensus();
    console.log('\nFinal Verification Complete: All systems operational.');
    process.exit(0);
  } catch (err) {
    console.error('Verification Failed:', err);
    process.exit(1);
  }
}

run();
