const { calculateIdentityCreditScore } = require('./identityCreditScore');

async function verifyIdentityScoring() {
  console.log('--- Verifying Identity Scoring ---');
  
  // Test 1: Base case
  const baseResult = calculateIdentityCreditScore({
    txCount: 0,
    balanceUsd: 0,
    totalRepaidLoans: 0,
    hasDefaults: false,
    attestations: []
  });
  console.log(`Base Score: ${baseResult.score} (Tier: ${baseResult.tier})`);

  // Test 2: Enriched case
  const enrichmentResult = calculateIdentityCreditScore({
    txCount: 200,
    balanceUsd: 5000,
    totalRepaidLoans: 3,
    hasDefaults: false,
    hasWorldID: true,
    gitcoinPassportScore: 40,
    attestations: [{
      schemaId: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      issuedAt: Math.floor(Date.now() / 1000) - 86400,
      revoked: false
    }]
  });
  console.log(`Enriched Score: ${enrichmentResult.score} (Tier: ${enrichmentResult.tier})`);
  
  if (enrichmentResult.tier === 'TITAN' || enrichmentResult.tier === 'PREMIUM') {
    console.log('✅ High identity tier achieved');
  } else {
    console.log('❌ Identity scoring below institutional threshold');
  }
}

verifyIdentityScoring().catch(console.error);
