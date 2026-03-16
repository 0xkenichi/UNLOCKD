// Verification script for Pyth Integration
const pyth = require('../solana/pyth');
const sovereignDataService = require('../lib/SovereignDataService');
require('dotenv').config();

async function verify() {
  console.log('--- Verifying Pyth Service ---');
  const symbols = ['SOL', 'ETH', 'BTC'];
  
  for (const symbol of symbols) {
    console.log(`Fetching price for ${symbol}...`);
    try {
      const priceData = await pyth.getPriceForSymbol(symbol);
      if (priceData) {
        const price = Number(priceData.price) * Math.pow(10, priceData.expo);
        console.log(`[Success] ${symbol}: $${price.toFixed(2)} (FeedId: ${await pyth.resolveFeedIdForSymbol(symbol)})`);
      } else {
        console.error(`[Error] Could not fetch price for ${symbol}`);
      }
    } catch (err) {
      console.error(`[Error] Failed for ${symbol}:`, err.message);
    }
  }

  console.log('\n--- Verifying SovereignDataService Integration ---');
  for (const symbol of symbols) {
    console.log(`Getting consensus price for ${symbol}...`);
    try {
      const details = await sovereignDataService.getConsensusPrice(symbol, true);
      console.log(`Consensus details for ${symbol}:`, JSON.stringify(details, null, 2));
      
      const pythContribution = details.find(d => d.source === 'Pyth');
      if (pythContribution && pythContribution.price) {
        console.log(`[Success] Pyth contributed: $${pythContribution.price.toFixed(2)}`);
      } else {
        console.error(`[Error] Pyth did not contribute a valid price for ${symbol}`);
      }
    } catch (err) {
      console.error(`[Error] Consensus failed for ${symbol}:`, err.message);
    }
  }
}

verify().then(() => console.log('\nVerification complete.'));
