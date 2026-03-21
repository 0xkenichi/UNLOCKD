const { computeScore } = require('./identityCreditScore');

async function verifyIdentityScoring() {
  console.log('--- Verifying Identity Scoring ---');
  
  // Test 1: Base case
  const baseInput = {
    identity: { walletAgeMonths: 0 },
    creditHistory: { repaidCount: 0, defaultedCount: 0 }
  };
  const baseResult = computeScore(baseInput);
  console.log(`Base Score: ${baseResult.crdtScore} (Tier: ${baseResult.crdtTier})`);

  // Test 2: Enriched case
  const enrichmentInput = {
    identity: { walletAgeMonths: 6, linkedAt: new Date().toISOString() },
    creditHistory: { repaidCount: 3, defaultedCount: 0 }
  };
  const enrichmentResult = computeScore(enrichmentInput);
  console.log(`Enriched Score: ${enrichmentResult.crdtScore} (Tier: ${enrichmentResult.crdtTier})`);
  
  if (enrichmentResult.crdtTier >= 3) {
    console.log('✅ High identity tier achieved');
  } else {
    console.log('❌ Identity scoring below institutional threshold');
  }
}

verifyIdentityScoring().catch(console.error);
