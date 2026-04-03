/**
 * VCS Engine v3.0 — Vitest Test Suite
 * Updated for the 6-tier system with HNWI 60% LTV boost.
 */

import { describe, it, expect } from "vitest";
import { computeVcs, vcsImpactOnDdpv, VcsInput } from "../frontend/src/lib/vcsEngine";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_INPUT: VcsInput = {
  gitcoinPassportScore: 0,
  txCount: 0,
  walletAgedays: 0,
  uniqueProtocolsUsed: 0,
  balanceUsd: 0,
  latestTxTimestamp: 0,
  volumeTraded: 0,
  largestTx: 0,
  totalRepaidLoans: 0,
  totalRepaidUsd: 0,
  hasActiveDefaults: false,
  lateRepaymentCount: 0,
  activeVestingUsd: 0,
  vestingMonthlyInflowUsd: 0,
};

const TITAN_HNWI_INPUT: VcsInput = {
  gitcoinPassportScore: 100,       // +500 pts
  txCount: 2500,                   
  walletAgedays: 900,              
  uniqueProtocolsUsed: 10,         
  balanceUsd: 600_000,
  latestTxTimestamp: Math.floor(Date.now()/1000) - 86400, 
  volumeTraded: 600_000,           
  largestTx: 300_000,              
  totalRepaidLoans: 10,             
  totalRepaidUsd: 500_000,         
  hasActiveDefaults: false,
  lateRepaymentCount: 0,
  activeVestingUsd: 250_000,       // +100 pts
  vestingMonthlyInflowUsd: 10_000, // +200 pts
};

const DIAMOND_INPUT: VcsInput = {
  gitcoinPassportScore: 64,        // +320 pts
  txCount: 340,                    
  walletAgedays: 480,              
  uniqueProtocolsUsed: 6,          
  balanceUsd: 12_500,              
  latestTxTimestamp: Math.floor(Date.now()/1000) - (86400 * 20),
  volumeTraded: 100_000,           
  largestTx: 8000,                 
  totalRepaidLoans: 2,             
  totalRepaidUsd: 18_000,          
  hasActiveDefaults: false,
  lateRepaymentCount: 0,
  activeVestingUsd: 25_000,        
  vestingMonthlyInflowUsd: 2_500,  
};

// ─── Baseline ────────────────────────────────────────────────────────────────

describe("baseline", () => {
  it("empty input yields baseline score 100", () => {
    const r = computeVcs(BASE_INPUT);
    expect(r.score).toBe(100);
  });

  it("empty input yields SCOUT tier", () => {
    const r = computeVcs(BASE_INPUT);
    expect(r.tier).toBe("SCOUT");
  });

  it("empty input ltvBoostBps is 0", () => {
    expect(computeVcs(BASE_INPUT).ltvBoostBps).toBe(0);
  });

  it("empty input maxBorrowCap is 0 (SCOUT)", () => {
    expect(computeVcs(BASE_INPUT).maxBorrowCapUsdc).toBe(0);
  });
});

// ─── Tier thresholds ─────────────────────────────────────────────────────────

describe("tier thresholds (v3.0)", () => {
  it("DIAMOND input matches DIAMOND threshold (>= 1100)", () => {
    const res = computeVcs(DIAMOND_INPUT);
    expect(res.score).toBeGreaterThanOrEqual(1100);
    expect(res.tier).toBe("DIAMOND");
  });

  it("TITAN input matches TITAN threshold (>= 1400)", () => {
    const res = computeVcs(TITAN_HNWI_INPUT);
    expect(res.score).toBeGreaterThanOrEqual(1400);
    expect(res.tier).toBe("TITAN");
  });

  it("HNWI TITAN gives 60% LTV boost", () => {
    expect(computeVcs(TITAN_HNWI_INPUT).ltvBoostBps).toBe(6000);
  });
});

// ─── Identity scoring ─────────────────────────────────────────────────────────

describe("identity scoring", () => {
  it("gitcoin score 60 yields 300 pts", () => {
    const r = computeVcs({ ...BASE_INPUT, gitcoinPassportScore: 60 });
    const earned = r.breakdown.identity.factors.find(f => f.label === "Gitcoin Passport")!.earned;
    expect(earned).toBe(300);
  });
});

// ─── Penalties ────────────────────────────────────────────────────────────────

describe("penalties", () => {
  it("active default deducts 300 pts", () => {
    const r = computeVcs({ ...DIAMOND_INPUT, hasActiveDefaults: true });
    // Without default: ~1100-1200. With default: -300.
    const without = computeVcs(DIAMOND_INPUT).score;
    expect(without - r.score).toBe(300);
  });

  it("score cannot exceed 1600", () => {
    expect(computeVcs(TITAN_HNWI_INPUT).score).toBeLessThanOrEqual(1600);
  });
});

// ─── Tier benefits ────────────────────────────────────────────────────────────

describe("tier benefits (v3.0)", () => {
  it("TITAN ltvBoostBps is 6000", () => {
    expect(computeVcs(TITAN_HNWI_INPUT).ltvBoostBps).toBe(6000);
  });

  it("SAPPHIRE ltvBoostBps is 5000", () => {
    // 100 + (50 * 5 = 250) + 275 + 500 + 200 = 1325 (Sapphire)
    const res = computeVcs({ ...TITAN_HNWI_INPUT, gitcoinPassportScore: 50, vestingMonthlyInflowUsd: 2500 });
    expect(res.tier).toBe("SAPPHIRE");
    expect(res.ltvBoostBps).toBe(5000);
  });

  it("BRONZE ltvBoostBps is 1000", () => {
     const r = computeVcs({ ...BASE_INPUT, gitcoinPassportScore: 80 }); // 400 + 100 = 500
     expect(r.tier).toBe("BRONZE");
     expect(r.ltvBoostBps).toBe(1000);
  });
});

// ─── dDPV impact ─────────────────────────────────────────────────────────────

describe("vcsImpactOnDdpv", () => {
  it("TITAN raises effective LTV and respects 60% cap", () => {
    const vcs    = computeVcs(TITAN_HNWI_INPUT);
    const impact = vcsImpactOnDdpv(vcs, 2500, 1200); // Base 25%
    expect(impact.effectiveLtvBps).toBe(6000); // 25 + 60 = 85 -> capped at 60
  });

  it("TITAN lowers effective rate by 6%", () => {
    const vcs    = computeVcs(TITAN_HNWI_INPUT);
    const impact = vcsImpactOnDdpv(vcs, 3000, 1200); // Base 12%
    expect(impact.effectiveRateBps).toBe(600); // 1200 - 600 = 600 (6%)
  });
});
