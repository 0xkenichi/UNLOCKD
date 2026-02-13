const { initAgent, answerAgent } = require('../agent');

const CASES = [
  {
    name: 'Getting started walkthrough',
    message: 'tell me how to use this app',
    expectedIntent: 'getting_started'
  },
  {
    name: 'Repay revert diagnosis',
    message: 'repayLoan reverted, simulation error 0xfb8f41b2, what should I check?',
    expectedIntent: 'repay_troubleshoot'
  },
  {
    name: 'Borrow + risk question',
    message: 'how should I set LTV and borrow amount for a 12 month unlock with high volatility?',
    expectedIntent: 'borrow_flow'
  },
  {
    name: 'Governance checklist',
    message: 'give governance checklist for risk parameter updates',
    expectedIntent: 'governance'
  }
];

const run = async () => {
  const agent = initAgent();
  let passCount = 0;
  for (const testCase of CASES) {
    const result = await answerAgent(agent, {
      message: testCase.message,
      history: [],
      memory: [],
      context: {
        path: '/repay',
        chainId: 11155111,
        walletAddress: '0x0000000000000000000000000000000000000001',
        page: 'eval'
      }
    });
    const passed = result.intent === testCase.expectedIntent;
    if (passed) passCount += 1;
    const headline = String(result.answer || '').split('\n').find(Boolean) || '(empty)';
    console.log(`\n[${passed ? 'PASS' : 'FAIL'}] ${testCase.name}`);
    console.log(`  expected: ${testCase.expectedIntent}`);
    console.log(`  actual:   ${result.intent}`);
    console.log(`  confidence: ${result.confidence}`);
    console.log(`  provider: ${result.provider || 'none'} | mode: ${result.mode}`);
    console.log(`  headline: ${headline}`);
  }
  console.log(`\nIntent accuracy: ${passCount}/${CASES.length}`);
  if (passCount < CASES.length) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error('[agent-eval] failed', error);
  process.exit(1);
});
