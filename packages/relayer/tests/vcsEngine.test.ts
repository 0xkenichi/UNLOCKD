/**
 * VCS Engine v2 — Vitest Test Suite
 * 56 test cases covering: tier thresholds, factor caps, penalties,
 * upgrade hints, dDPV impact, edge cases, and invariants.
 */

import { describe, it, expect } from "vitest";
import { computeVcs, vcsImpactOnDdpv, VcsInput } from "./vcsEngine";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_INPUT: VcsInput = {
  gitcoinPassportScore: 0,
  hasWorldID: false,
  easAttestations: [],
  txCount: 0,
  walletAgedays: 0,
  uniqueProtocolsUsed: 0,
  balanceUsd: 0,
  totalRepaidLoans: 0,
  totalRepaidUsd: 0,
  hasActiveDefaults: false,
  lateRepaymentCount: 0,
};

const TITAN_INPUT: VcsInput = {
  gitcoinPassportScore: 50,        // +150
  hasWorldID: true,                // +100
  easAttestations: [
    { schema: "0x1e7a29d7b8e5a3c4f2d6b0e9c3a7f1d5e8b2a4c6", attester: "0xA", revoked: false }, // KYC +50
    { schema: "0x3c8f2a1d7b4e6c9f0a2d5b8e1c4f7a0d3b6e9c2", attester: "0xB", revoked: false }, // Investor +40
    { schema: "0x7a4b2c9d1e6f3a8b5c2d9e4f1a6b3c8d5e2f7a1", attester: "0xC", revoked: false }, // Builder +30
  ],                               // +120 (capped at 150)
  txCount: 2500,                   // +100
  walletAgedays: 900,              // +60
  uniqueProtocolsUsed: 10,         // +60
  balanceUsd: 600_000,             // +80
  totalRepaidLoans: 5,             // +100
  totalRepaidUsd: 200_000,         // +100
  hasActiveDefaults: false,
  lateRepaymentCount: 0,
  veCrdtBalance: 15_000,           // +75
  gaugeVotesCount: 5,              // +25
};

const PREMIUM_INPUT: VcsInput = {
  gitcoinPassportScore: 35,
  hasWorldID: true,
  easAttestations: [],
  txCount: 340,
  walletAgedays: 480,
  uniqueProtocolsUsed: 6,
  balanceUsd: 12_500,
  totalRepaidLoans: 2,
  totalRepaidUsd: 18_000,
  hasActiveDefaults: false,
  lateRepaymentCount: 0,
  veCrdtBalance: 750,
  gaugeVotesCount: 3,
};

// ─── Baseline ────────────────────────────────────────────────────────────────

describe("baseline", () => {
  it("empty input yields score 500", () => {
    const r = computeVcs(BASE_INPUT);
    expect(r.score).toBe(500);
  });

  it("empty input yields STANDARD tier", () => {
    const r = computeVcs(BASE_INPUT);
    expect(r.tier).toBe("STANDARD");
  });

  it("empty input riskMultiplier is 0.5", () => {
    const r = computeVcs(BASE_INPUT);
    expect(r.riskMultiplier).toBe(0.5);
  });

  it("empty input ltvBoostBps is 0", () => {
    expect(computeVcs(BASE_INPUT).ltvBoostBps).toBe(0);
  });

  it("empty input rateSurcharge is 0", () => {
    expect(computeVcs(BASE_INPUT).rateSurchargeOrDiscountBps).toBe(0);
  });

  it("empty input maxBorrowCap is 100_000", () => {
    expect(computeVcs(BASE_INPUT).maxBorrowCapUsdc).toBe(100_000);
  });
});

// ─── Tier thresholds ─────────────────────────────────────────────────────────

describe("tier thresholds", () => {
  it("score 650 is PREMIUM", () => {
    // Need score=650: baseline 500 + worldId 100 + txActivity 50 = 650
    const r = computeVcs({ ...BASE_INPUT, hasWorldID: true, txCount: 200 });
    expect(r.score).toBe(650);
    expect(r.tier).toBe("PREMIUM");
  });

  it("score 649 is STANDARD", () => {
    const r = computeVcs({ ...BASE_INPUT, hasWorldID: true, txCount: 101 });
    expect(r.score).toBeLessThan(650);
    expect(r.tier).toBe("STANDARD");
  });

  it("TITAN input is TITAN", () => {
    expect(computeVcs(TITAN_INPUT).tier).toBe("TITAN");
  });

  it("TITAN score >= 800", () => {
    expect(computeVcs(TITAN_INPUT).score).toBeGreaterThanOrEqual(800);
  });

  it("PREMIUM input is PREMIUM", () => {
    expect(computeVcs(PREMIUM_INPUT).tier).toBe("PREMIUM");
  });

  it("PREMIUM score in [650, 799]", () => {
    const s = computeVcs(PREMIUM_INPUT).score;
    expect(s).toBeGreaterThanOrEqual(650);
    expect(s).toBeLessThan(800);
  });
});

// ─── Identity scoring ─────────────────────────────────────────────────────────

describe("identity scoring", () => {
  it("gitcoin score 50 yields max 150 pts", () => {
    const r = computeVcs({ ...BASE_INPUT, gitcoinPassportScore: 50 });
    const earned = r.breakdown.identity.factors.find(f => f.label === "Gitcoin Passport")!.earned;
    expect(earned).toBe(150);
  });

  it("gitcoin score 100 is capped at 150 pts", () => {
    const r = computeVcs({ ...BASE_INPUT, gitcoinPassportScore: 100 });
    const earned = r.breakdown.identity.factors.find(f => f.label === "Gitcoin Passport")!.earned;
    expect(earned).toBe(150);
  });

  it("World ID adds exactly 100 pts", () => {
    const withWorldId = computeVcs({ ...BASE_INPUT, hasWorldID: true }).score;
    const without     = computeVcs(BASE_INPUT).score;
    expect(withWorldId - without).toBe(100);
  });

  it("revoked EAS attestation gives 0 pts", () => {
    const r = computeVcs({
      ...BASE_INPUT,
      easAttestations: [
        { schema: "0x1e7a29d7b8e5a3c4f2d6b0e9c3a7f1d5e8b2a4c6", attester: "0xA", revoked: true }
      ],
    });
    const eas = r.breakdown.identity.factors.find(f => f.label === "EAS attestations")!.earned;
    expect(eas).toBe(0);
  });

  it("unknown EAS schema gives 0 pts", () => {
    const r = computeVcs({
      ...BASE_INPUT,
      easAttestations: [{ schema: "0xdeadbeef", attester: "0xA", revoked: false }],
    });
    const eas = r.breakdown.identity.factors.find(f => f.label === "EAS attestations")!.earned;
    expect(eas).toBe(0);
  });

  it("EAS pts capped at 150", () => {
    const r = computeVcs({
      ...BASE_INPUT,
      easAttestations: [
        { schema: "0x1e7a29d7b8e5a3c4f2d6b0e9c3a7f1d5e8b2a4c6", attester: "0xA", revoked: false },
        { schema: "0x3c8f2a1d7b4e6c9f0a2d5b8e1c4f7a0d3b6e9c2", attester: "0xB", revoked: false },
        { schema: "0x7a4b2c9d1e6f3a8b5c2d9e4f1a6b3c8d5e2f7a1", attester: "0xC", revoked: false },
        { schema: "0x2d8f5a3c7b1e4d9f6a2c5b8e3d1f4a7c2b5e8d3", attester: "0xD", revoked: false },
      ],
    });
    const eas = r.breakdown.identity.factors.find(f => f.label === "EAS attestations")!.earned;
    expect(eas).toBeLessThanOrEqual(150);
  });
});

// ─── Activity scoring ─────────────────────────────────────────────────────────

describe("activity scoring", () => {
  it("txCount 0 gives 0 tx pts", () => {
    const r = computeVcs(BASE_INPUT);
    const f = r.breakdown.activity.factors.find(f => f.label === "Transaction count")!;
    expect(f.earned).toBe(0);
  });

  it("txCount 2000+ gives max 100 tx pts", () => {
    const r = computeVcs({ ...BASE_INPUT, txCount: 2001 });
    const f = r.breakdown.activity.factors.find(f => f.label === "Transaction count")!;
    expect(f.earned).toBe(100);
  });

  it("wallet age > 730d gives 60 pts", () => {
    const r = computeVcs({ ...BASE_INPUT, walletAgedays: 800 });
    const f = r.breakdown.activity.factors.find(f => f.label === "Wallet age")!;
    expect(f.earned).toBe(60);
  });

  it("10 protocols gives max 60 diversity pts", () => {
    const r = computeVcs({ ...BASE_INPUT, uniqueProtocolsUsed: 10 });
    const f = r.breakdown.activity.factors.find(f => f.label === "Protocol diversity")!;
    expect(f.earned).toBe(60);
  });

  it("balanceUsd 500K+ gives max 80 balance pts", () => {
    const r = computeVcs({ ...BASE_INPUT, balanceUsd: 600_000 });
    const f = r.breakdown.activity.factors.find(f => f.label === "Portfolio balance")!;
    expect(f.earned).toBe(80);
  });
});

// ─── Penalties ────────────────────────────────────────────────────────────────

describe("penalties", () => {
  it("active default deducts 300 pts", () => {
    const without = computeVcs(PREMIUM_INPUT).score;
    const with_   = computeVcs({ ...PREMIUM_INPUT, hasActiveDefaults: true }).score;
    expect(without - with_).toBe(300);
  });

  it("active default on fresh address caps score correctly", () => {
    const r = computeVcs({ ...BASE_INPUT, hasActiveDefaults: true });
    expect(r.score).toBe(200); // 500 - 300
    expect(r.tier).toBe("STANDARD");
  });

  it("1 late repayment deducts 30 pts", () => {
    const without = computeVcs(PREMIUM_INPUT).score;
    const with_   = computeVcs({ ...PREMIUM_INPUT, lateRepaymentCount: 1 }).score;
    expect(without - with_).toBe(30);
  });

  it("late repayment penalty capped at 150 pts", () => {
    const r = computeVcs({ ...BASE_INPUT, lateRepaymentCount: 100 });
    const p = r.breakdown.penalties.factors.find(f => f.label === "Late repayments")!;
    expect(p.earned).toBe(150);
  });

  it("score cannot go below 0", () => {
    const r = computeVcs({
      ...BASE_INPUT,
      hasActiveDefaults: true,
      lateRepaymentCount: 100,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("score cannot exceed 1000", () => {
    expect(computeVcs(TITAN_INPUT).score).toBeLessThanOrEqual(1000);
  });
});

// ─── Tier benefits ────────────────────────────────────────────────────────────

describe("tier benefits", () => {
  it("TITAN ltvBoostBps is 1000", () => {
    expect(computeVcs(TITAN_INPUT).ltvBoostBps).toBe(1000);
  });

  it("PREMIUM ltvBoostBps is 500", () => {
    expect(computeVcs(PREMIUM_INPUT).ltvBoostBps).toBe(500);
  });

  it("STANDARD ltvBoostBps is 0", () => {
    expect(computeVcs(BASE_INPUT).ltvBoostBps).toBe(0);
  });

  it("TITAN rate discount is -400 bps", () => {
    expect(computeVcs(TITAN_INPUT).rateSurchargeOrDiscountBps).toBe(-400);
  });

  it("PREMIUM rate discount is -200 bps", () => {
    expect(computeVcs(PREMIUM_INPUT).rateSurchargeOrDiscountBps).toBe(-200);
  });

  it("TITAN maxBorrowCap is 2_000_000", () => {
    expect(computeVcs(TITAN_INPUT).maxBorrowCapUsdc).toBe(2_000_000);
  });

  it("PREMIUM maxBorrowCap is 500_000", () => {
    expect(computeVcs(PREMIUM_INPUT).maxBorrowCapUsdc).toBe(500_000);
  });
});

// ─── Next-tier delta ──────────────────────────────────────────────────────────

describe("nextTierDelta", () => {
  it("TITAN has null nextTierDelta", () => {
    expect(computeVcs(TITAN_INPUT).nextTierDelta).toBeNull();
  });

  it("PREMIUM nextTierDelta is positive", () => {
    const r = computeVcs(PREMIUM_INPUT);
    expect(r.nextTierDelta).toBeGreaterThan(0);
  });

  it("nextTierDelta + score >= next tier threshold for PREMIUM", () => {
    const r = computeVcs(PREMIUM_INPUT);
    expect(r.score + r.nextTierDelta!).toBeGreaterThanOrEqual(800);
  });

  it("STANDARD nextTierDelta targets 650", () => {
    const r = computeVcs(BASE_INPUT);
    expect(r.score + r.nextTierDelta!).toBeGreaterThanOrEqual(650);
  });
});

// ─── Upgrade hints ────────────────────────────────────────────────────────────

describe("upgradeHints", () => {
  it("TITAN has no upgrade hints", () => {
    expect(computeVcs(TITAN_INPUT).upgradeHints).toHaveLength(0);
  });

  it("fresh address has hints", () => {
    expect(computeVcs(BASE_INPUT).upgradeHints.length).toBeGreaterThan(0);
  });

  it("hints have pointsGain > 0", () => {
    const hints = computeVcs(BASE_INPUT).upgradeHints;
    hints.forEach(h => expect(h.pointsGain).toBeGreaterThan(0));
  });

  it("World ID hint appears when not verified", () => {
    const hints = computeVcs(BASE_INPUT).upgradeHints;
    expect(hints.some(h => h.action.toLowerCase().includes("world id"))).toBe(true);
  });

  it("World ID hint disappears when already verified", () => {
    const hints = computeVcs({ ...BASE_INPUT, hasWorldID: true }).upgradeHints;
    expect(hints.some(h => h.action.toLowerCase().includes("world id"))).toBe(false);
  });

  it("max 4 hints returned", () => {
    const hints = computeVcs(BASE_INPUT).upgradeHints;
    expect(hints.length).toBeLessThanOrEqual(4);
  });
});

// ─── dDPV impact ─────────────────────────────────────────────────────────────

describe("vcsImpactOnDdpv", () => {
  it("TITAN raises effective LTV", () => {
    const vcs    = computeVcs(TITAN_INPUT);
    const impact = vcsImpactOnDdpv(vcs, 3000, 1200);
    expect(impact.effectiveLtvBps).toBeGreaterThan(impact.baseLtvBps);
  });

  it("TITAN lowers effective rate", () => {
    const vcs    = computeVcs(TITAN_INPUT);
    const impact = vcsImpactOnDdpv(vcs, 3000, 1200);
    expect(impact.effectiveRateBps).toBeLessThan(impact.baseRateBps);
  });

  it("effective LTV hard-capped at 6000 bps (60%)", () => {
    const vcs    = computeVcs(TITAN_INPUT);
    const impact = vcsImpactOnDdpv(vcs, 5500, 1200); // 55% base + 10% boost → cap at 60%
    expect(impact.effectiveLtvBps).toBeLessThanOrEqual(6000);
  });

  it("effective rate cannot go below 0", () => {
    const vcs    = computeVcs(TITAN_INPUT);
    const impact = vcsImpactOnDdpv(vcs, 3000, 100); // 1% base − 4% discount → floor 0
    expect(impact.effectiveRateBps).toBeGreaterThanOrEqual(0);
  });

  it("TITAN omegaFloor is 0.7", () => {
    const vcs    = computeVcs(TITAN_INPUT);
    const impact = vcsImpactOnDdpv(vcs, 3000, 1200);
    expect(impact.omegaFloor).toBe(0.7);
  });

  it("STANDARD omegaFloor is 0.3", () => {
    const vcs    = computeVcs(BASE_INPUT);
    const impact = vcsImpactOnDdpv(vcs, 3000, 1200);
    expect(impact.omegaFloor).toBe(0.3);
  });
});
