const { computeScore } = require('./packages/backend/identityCreditScore');

const testCases = [
  {
    name: "New Wallet (< 3 months)",
    input: {
      identity: { walletAgeMonths: 1 },
      attestations: [],
      creditHistory: { repaidCount: 0, defaultedCount: 0 }
    },
    expectedBase: 0
  },
  {
    name: "3 Month Wallet",
    input: {
      identity: { walletAgeMonths: 3 },
      attestations: [],
      creditHistory: { repaidCount: 0, defaultedCount: 0 }
    },
    expectedBase: 100
  },
  {
    name: "6 Month Wallet",
    input: {
      identity: { walletAgeMonths: 6 },
      attestations: [],
      creditHistory: { repaidCount: 0, defaultedCount: 0 }
    },
    expectedBase: 200
  },
  {
      name: "6 Month Wallet with Gitcoin (90)",
      input: {
        identity: { walletAgeMonths: 6 },
        attestations: [{ provider: 'gitcoin_passport', score: 20 }],
        creditHistory: { repaidCount: 0, defaultedCount: 0 }
      },
      expectedBase: 200
    }
];

testCases.forEach(tc => {
  const result = computeScore(tc.input);
  console.log(`Test: ${tc.name}`);
  console.log(`- Wallet Age: ${tc.input.identity.walletAgeMonths}mo`);
  console.log(`- Wallet Age Base Score: ${result.walletAgeBaseScore}`);
  console.log(`- Composite Score: ${result.compositeScore}`);
  console.log(`- Tier: ${result.identityTier}`);
  console.log(`- Reason Codes: ${result.reasonCodes.join(', ')}`);
  console.log('---');
});
