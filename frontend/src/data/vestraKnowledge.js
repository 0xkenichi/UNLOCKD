const KNOWLEDGE_ENTRIES = [
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
      'Pool matching in Vestra is preference-aware. Offers are ranked by risk tier, effective LTV, and policy constraints (loan size, unlock windows, access controls). If no offers match, reduce desired borrow or broaden acceptable pool preferences.'
  },
  {
    keywords: ['repay', 'repayment', 'interest'],
    answer:
      'Repayment includes principal plus configured interest terms. To reduce liquidation/default pressure, monitor unlock progress and maintain collateral safety buffers, especially during volatile windows.'
  }
];

export const FALLBACK_ANSWER =
  'Vestra AI is temporarily running in fallback mode. I can still help with DPV, LTV, unlock risk, pool matching, and governance steps using protocol knowledge.';

export function findLocalAnswer(input) {
  const text = String(input || '').toLowerCase();
  if (!text) return null;
  let best = null;
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
