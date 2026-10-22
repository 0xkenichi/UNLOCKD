// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const KNOWLEDGE_ENTRIES = [
  {
    keywords: ['how to use', 'how do i use this app', 'getting started', 'walkthrough', 'explain app'],
    answer:
      'Start with wallet + network, then follow this flow: Borrow (escrow vesting collateral and create loan), Repay (fund gas/USDC, approve USDC, then repay by loan ID), and Portfolio (monitor active loans and unlock timelines). For repay errors, confirm the connected wallet is the original borrower and the loan is still active on the current chain.'
  },
  {
    keywords: ['dpv', 'discounted present value', 'present value'],
    answer:
      'DPV is the present value the ValuationEngine contract puts on locked tokens: quantity × price × e^(−r·T) × (1 − σ/2) × Ω. The price is the lowest of spot, time-weighted and smoothed price; r is the discount rate of the stream\'s rank (2%, 5% or 10% a year); T is the time to unlock; σ is one volatility setting applied to every token (50% by default); Ω is a per-token risk control between 0 and 1. A drawdown penalty applies when governance has set a token\'s price range. Your maximum loan is DPV × the rank\'s LTV.'
  },
  {
    keywords: ['ltv', 'loan to value', 'borrow limit'],
    answer:
      'The maximum LTV is set by the stream\'s rank: 50% (rank I), 35% (rank II) or 20% (rank III) of DPV, and governance can cap it lower per token. Each rank also has a liquidation threshold (65%, 50%, 35%). At the maximum, a price fall of about 23%, 30% or 43% triggers liquidation, whatever the token, so borrowing less than the maximum is the main way to lower the risk. The Borrow page shows the price fall that would liquidate the amount you choose.'
  },
  {
    keywords: ['unlock', 'unlock risk', 'timeline'],
    answer:
      'A longer time to unlock lowers DPV through the e^(−r·T) discount, so you can borrow less. It also gives the price longer to fall: the chance of reaching the liquidation trigger grows with time. Loans mature no later than the unlock; past maturity plus a 3-day grace period, an unpaid loan can be liquidated.'
  },
  {
    keywords: ['liquidation', 'liquidated', 'auction', 'health factor'],
    answer:
      'A loan can be liquidated when its debt exceeds the liquidation threshold × the collateral\'s value, or after maturity plus 3 days. Anyone can then start a Dutch auction of the stream: it starts at 120% of the larger of its market value and the debt and falls to 10% of that over 3 days, restarting lower if no one bids. You can still repay the full debt during the auction to cancel it. Anything the auction raises above the debt is yours to claim; the stream itself goes to the buyer.'
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
      'Interest floats with how much of the lending pool is in use (5% a year when idle, 15% at 80% use, up to 75% when fully used) and is paid before principal. Repay any amount at any time; repaying in full returns the stream with everything that vested while it was held. Because debt can grow faster than the collateral\'s value, a long period of high pool use can push a loan toward liquidation even if the price does not move.'
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
