const VestingOracleService = require('./packages/backend/lib/VestingOracleService');
const { createPublicClient, http } = require('viem');
const { mainnet, base, sepolia } = require('viem/chains');

// Mock Alchemy Key (not needed for this test if we use public RPCs or mock responses)
const mockClients = {
  1: createPublicClient({ chain: mainnet, transport: http() }),
  8453: createPublicClient({ chain: base, transport: http() }),
  11155111: createPublicClient({ chain: sepolia, transport: http() })
};

async function runVerification() {
  console.log('--- Vcs Vesting Integration Verification ---');
  
  const testWallet = '0x000000000000000000000000000000000000dead'; // Example
  
  console.log(`Testing wallet: ${testWallet}`);
  
  try {
    const results = await VestingOracleService.fetchUserVestings(testWallet, 'all', mockClients);
    
    console.log(`Found ${results.length} vesting positions.`);
    
    results.forEach(pos => {
      console.log(`- [${pos.protocol}] ${pos.tokenSymbol}: Locked: $${pos.valueUsd.toFixed(2)}, Monthly Inflow: $${pos.monthlyInflowUsd.toFixed(2)}`);
      if (pos.ratePerSecond) {
          console.log(`  Rate: ${pos.ratePerSecond} wad/sec`);
      }
    });

    // Check one known protocol mock (Superfluid)
    const mockSf = {
        protocol: 'Superfluid',
        tokenSymbol: 'USDCx',
        tokenDecimals: 18,
        ratePerSecond: '380414535736', // ~1 USDC/month
        quantity: '1000'
    };
    
    const enriched = await VestingOracleService.enrichWithPrices([mockSf]);
    console.log('\n--- Mock Superfluid Calculation Check ---');
    console.log(`Input Rate: ${mockSf.ratePerSecond} (~1 USDC/mo)`);
    console.log(`Enriched Result Monthly Inflow: $${enriched[0].monthlyInflowUsd.toFixed(4)}`);
    
    if (Math.abs(enriched[0].monthlyInflowUsd - 1.0) < 0.1) {
        console.log('✅ Calculation matches expected $1/mo inflow.');
    } else {
        console.log('❌ Calculation mismatch!');
    }

  } catch (err) {
    console.error('Verification failed:', err);
  }
}

runVerification();
