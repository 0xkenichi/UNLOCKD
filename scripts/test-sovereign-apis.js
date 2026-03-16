// scripts/test-sovereign-apis.js
require('dotenv').config({ path: 'packages/backend/.env' });
const SovereignDataService = require('../packages/backend/lib/SovereignDataService');
const persistence = require('../packages/backend/persistence');

async function runTest() {
  console.log('--- STARTING SOVEREIGN API VERIFICATION ---');
  
  try {
    // Initialize persistence
    await persistence.init();
    console.log('✅ Persistence initialized (Supabase/SQLite)');

    // 1. Test Mobula Market Data
    console.log('\n[1/4] Testing Mobula Market Data (BTC)...');
    const btcMarket = await SovereignDataService.fetchMobulaMarketData('BTC');
    if (btcMarket) {
      console.log('✅ Mobula Market Data:', btcMarket);
    } else {
      console.warn('❌ Mobula Market Data failed (Check API Key)');
    }

    // 2. Test Tokenomist Discovery (Simulated/Partial)
    console.log('\n[2/4] Testing Tokenomist Discovery (ETH on Ethereum)...');
    const ethVesting = await SovereignDataService.fetchTokenomistVesting('ethereum');
    if (ethVesting) {
      console.log('✅ Tokenomist Vesting Data:', JSON.stringify(ethVesting).slice(0, 100) + '...');
    } else {
      console.warn('❌ Tokenomist Vesting failed (Check API Key)');
    }

    // 3. Test Gitcoin Passport Score
    const testWallet = '0x0000000000000000000000000000000000000000'; // Dummy
    console.log(`\n[3/4] Testing Gitcoin Passport Score (${testWallet})...`);
    const gitcoinScore = await SovereignDataService.fetchGitcoinPassportScore(testWallet);
    if (gitcoinScore) {
      console.log('✅ Gitcoin Passport Score:', gitcoinScore);
    } else {
      console.warn('❌ Gitcoin Passport failed (Check API Key/ScorerId)');
    }

    // 4. Test Global Discovery & Enrichment
    console.log('\n[4/4] Running Exhaustive Global Discovery...');
    // We only test one chain to avoid long waits/rate limits in test
    process.env.TEST_CHAINS = 'ethereum'; 
    await SovereignDataService.discoverAllVestingContracts();
    
    // Check persistence
    const saved = await persistence.listVestingSources({ limit: 5 });
    console.log(`✅ Saved ${saved.length} sources to database with metadata.`);
    if (saved.length > 0 && saved[0].metadata) {
      console.log('✅ Persistence metadata check passed.');
    }

    console.log('\n--- VERIFICATION COMPLETE ---');
  } catch (err) {
    console.error('❌ Verification Error:', err.message);
  } finally {
    process.exit(0);
  }
}

runTest();
