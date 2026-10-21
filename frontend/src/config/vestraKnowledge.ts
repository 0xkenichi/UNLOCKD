export const KNOWLEDGE_ENTRIES = [
  {
    keywords: ['how to use', 'how do i use this app', 'getting started', 'walkthrough', 'explain app'],
    answer:
      'Start with wallet + network, then follow this flow: Borrow (approve your vesting-stream NFT to the VestingAdapter, then borrow USDC against it), Repay (approve USDC to the LoanManager, then repay by loan ID; anyone may repay a loan), and Portfolio (monitor active loans and unlock timelines). For repay errors, confirm the loan is still active (or in auction, where only a full repayment is accepted) on the current chain.'
  },
  {
    keywords: ['dpv', 'discounted present value', 'present value'],
    answer:
      'DPV is Vestra\'s discounted present value estimate for locked vesting collateral. It applies time, volatility, liquidity, and shock discounts to estimate borrow-safe value. The safer borrow range usually tracks a conservative LTV on top of DPV.'
  },
  {
    keywords: ['ltv', 'loan to value', 'borrow limit'],
    answer:
      'LTV in Vestra is risk-first and conservative. Higher unlock uncertainty and volatility should reduce LTV caps. A practical flow is: estimate DPV, use conservative percentiles (P5/ES5), then set max borrow based on the lower of protocol and pool constraints.'
  },
  {
    keywords: ['unlock', 'unlock risk', 'timeline'],
    answer:
      'Unlock timelines directly affect risk: longer horizons generally require stronger discounts and tighter LTV. If unlock timing is uncertain, use a more conservative borrow amount and document assumptions before executing.'
  },
  {
    keywords: ['governance', 'proposal', 'dao', 'vote'],
    answer:
      'For governance updates, Vestra expects evidence-driven proposals: include simulation outputs (especially P5/ES5), impact analysis on borrowers/lenders, clear parameter diffs, and rollback criteria before vote execution.'
  },
  {
    keywords: ['pool', 'lender', 'match'],
    answer:
      'Vestra has one USDC lending pool (an ERC-4626 vault). Lenders deposit USDC for shares; borrowers pay a floating, utilization-based rate, and interest accrues into the share price. There are no lock-ups, fixed terms or separate pools; withdrawals are limited only by idle liquidity.'
  },
  {
    keywords: ['repay', 'repayment', 'interest'],
    answer:
      'Debt is principal plus interest at the pool\'s floating rate; check the live amount with debtOf. Partial repayments pay interest first. Repay before maturity plus the grace period and keep the health factor above 1.0, or the loan can be sold in a Dutch auction.'
  }
];

export const FALLBACK_ANSWER =
  'CRDT AI is temporarily running in fallback mode. I can still help with DPV, LTV, unlock risk, pool matching, and governance steps using protocol knowledge.';

export function findLocalAnswer(input: string) {
  const text = String(input || '').toLowerCase();
  if (!text) return null;
  let best: { score: number; answer: string } | null = null;
  for (const entry of KNOWLEDGE_ENTRIES) {
    const score = entry.keywords.reduce(
      (total, keyword) => (text.includes(keyword) ? total + keyword.length : total),
      0
    );
    if (!best || score > best.score) {
      best = { score, answer: entry.answer };
    }
  }
  if (!best || best.score === 0) return null;
  return { answer: best.answer };
}
