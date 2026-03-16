// Scratch script to verify SovereignDataService API integrations
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'packages', 'backend', '.env') });
const SovereignDataService = require(path.join(__dirname, '..', 'packages', 'backend', 'lib', 'SovereignDataService'));

async function testAPIs() {
  console.log('--- Testing SovereignDataService APIs ---');
  
  const testSymbol = 'ETH';
  const testWallet = '0x0000000000000000000000000000000000000000'; // Dummy wallet
  const testToken = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
  
  console.log('\n1. Testing DIA Asset Info:');
  const diaInfo = await SovereignDataService.getDiaAssetInfo(testSymbol);
  console.log('DIA Result:', diaInfo ? 'SUCCESS' : 'FAILED');

  console.log('\n2. Testing CryptoRank Price:');
  const crPrice = await SovereignDataService.fetchCryptoRankPrice(testSymbol);
  console.log('CryptoRank Price Result:', crPrice ? 'SUCCESS' : 'FAILED');

  console.log('\n3. Testing Mobula Portfolio (Dummy Wallet):');
  const mobulaPortfolio = await SovereignDataService.getMobulaPortfolio(testWallet);
  console.log('Mobula Portfolio Result:', mobulaPortfolio ? 'SUCCESS' : 'FAILED');

  console.log('\n4. Testing DeFiLlama Vesting (Aave):');
  const llamaVesting = await SovereignDataService.fetchDeFiLlamaVesting('aave');
  console.log('DeFiLlama Result:', llamaVesting ? 'SUCCESS' : 'FAILED');

  console.log('\n5. Testing Consensus Pricing:');
  const consensus = await SovereignDataService.getConsensusPrice(testSymbol, true);
  console.log('Consensus Details:', consensus);
}

testAPIs().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
