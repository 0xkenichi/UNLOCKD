const { computeScore } = require('./identityCreditScore');

async function verifyIdentityScoring() {
  console.log('--- Verifying Identity Scoring ---');
  
  // Test 1: Base case
  const baseInput = {
    identity: { asiMigrated: false },
    creditHistory: { onChainVolume: 100000, activeMonths: 24 }
  };
  const baseResult = computeScore(baseInput);
  console.log(`Base Score: ${baseResult.compositeScore}`);

  // Test 2: Multi-chain enrichment (Mocked)
  const enrichmentInput = {
    identity: { walletAgeMonths: 6 },
    creditHistory: { onChainVolume: 100000, activeMonths: 24 }
  };
  const enrichmentResult = computeScore(enrichmentInput);
  console.log(`Enriched Score: ${enrichmentResult.compositeScore}`);
  
  if (enrichmentResult.compositeScore >= 500) {
    console.log('✅ Base identity tier achieved');
  } else {
    console.log('❌ Identity scoring below threshold');
  }
}

async function verifyLoanTerms() {
  console.log('\n--- Verifying Loan Term Logic ---');
  // This would normally test the computeLoanTerms function in server.js
  // But for now we just check the scoring impact
}

verifyIdentityScoring().catch(console.error);
