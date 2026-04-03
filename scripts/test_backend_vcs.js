const { calculateIdentityCreditScore } = require('./packages/backend/identityCreditScore');

const mockData = {
  gitcoinPassportScore: 80, // 400 pts
  txCount: 2500,           // 100 pts
  ageMonths: 24,           // 48 pts
  activeMonths: 12,        // 100 pts
  peakUsdValue: 500000,    // 150 pts
  activeVestingUsd: 150000,// 100 pts
  vestingMonthlyInflowUsd: 6000, // 200 pts
  totalRepaidLoans: 5,     // 100 pts
  hasActiveDefaults: false,
  lateRepaymentCount: 0
};

console.log('--- Testing Backend VCS Scoring Engine (v2.1) ---');
const result = calculateIdentityCreditScore(mockData);

console.log('Wallet: 0xTest');
console.log('Total Score:', result.score);
console.log('Tier:', result.tier);
console.log('Breakdown:', JSON.stringify(result.breakdown, null, 2));

// Baseline 100
// Identity 400
// Financial (100+48+100+150) = 398
// Vesting (100+200) = 300
// Credit 100
// Total = 100 + 400 + 398 + 300 + 100 = 1298

if (result.score === 1298) {
  console.log('✅ TEST PASSED: Score matches expected 1298');
} else {
  console.error('❌ TEST FAILED: Expected 1298, got ' + result.score);
}

const titanData = {
  ...mockData,
  gitcoinPassportScore: 100, // 500
  activeMonths: 15,          // 100
  peakUsdValue: 2000000,     // 200
  totalRepaidLoans: 10       // 200
};
// 100 + 500 + (100+48+100+200) + 300 + 200 = 1548 -> Wait, maxed out logic?
// Identity 500
// Financial 100 (tx) + 48 (age) + 100 (consistency) + 200 (peak) = 448
// Vesting 300
// Credit 200
// Total = 100 + 500 + 448 + 300 + 200 = 1548

const titanResult = calculateIdentityCreditScore(titanData);
console.log('\n--- TITAN Test ---');
console.log('Score:', titanResult.score);
console.log('Tier:', titanResult.tier);

const defaultData = {
  ...mockData,
  hasActiveDefaults: true
};
const defaultResult = calculateIdentityCreditScore(defaultData);
console.log('\n--- Default Penalty Test ---');
console.log('Score:', defaultResult.score);
console.log('Flags:', defaultResult.flags);
// 1298 - 100 (previous credit) - 500 (penalty) = 698
