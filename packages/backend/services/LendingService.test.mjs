import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const LendingService = require('./LendingService');
const { lendingPoolAbi, loanManagerAbi } = require('../contracts/abis');

const WALLET = '0x00000000000000000000000000000000000000c1';

function fakePool(overrides = {}) {
  return {
    totalAssets: vi.fn(async () => 1_000_000_000n),   // 1,000 USDC
    totalSupply: vi.fn(async () => 950_000_000n),
    totalBorrowed: vi.fn(async () => 600_000_000n),
    availableLiquidity: vi.fn(async () => 400_000_000n),
    utilizationBps: vi.fn(async () => 6000n),
    borrowRateBps: vi.fn(async () => 1000n),
    balanceOf: vi.fn(async () => 95_000_000n),
    maxWithdraw: vi.fn(async () => 100_000_000n),
    convertToAssets: vi.fn(async (shares) => (shares * 1_000_000_000n) / 950_000_000n),
    ...overrides
  };
}

describe('LendingService', () => {
  it('only calls functions that exist on the new contracts', () => {
    const poolFns = new Set(lendingPoolAbi.filter((x) => x.type === 'function').map((x) => x.name));
    for (const fn of Object.keys(fakePool())) expect(poolFns.has(fn), fn).toBe(true);
    expect(loanManagerAbi.some((x) => x.type === 'function' && x.name === 'reserveFactorBps')).toBe(true);
  });

  it('derives the supply rate from borrow rate, utilization and reserve factor', async () => {
    const loanManager = { reserveFactorBps: vi.fn(async () => 1000n) };
    const svc = new LendingService(null, { pool: fakePool(), loanManager });

    const stats = await svc.getPoolStats();

    // 10% APR × 60% utilization × (1 − 10% reserve) = 5.4%
    expect(stats.supplyRateBps).toBe('540');
    expect(stats).toMatchObject({
      totalAssets: '1000000000',
      totalBorrowed: '600000000',
      availableLiquidity: '400000000',
      utilizationBps: '6000',
      borrowRateBps: '1000',
      reserveFactorBps: '1000'
    });
  });

  it('falls back to the default reserve factor when LoanManager is not wired', async () => {
    const svc = new LendingService(null, { pool: fakePool() });
    expect((await svc.getPoolStats()).reserveFactorBps).toBe('1000');
  });

  it('reports a lender position as shares, their asset value and the withdrawable amount', async () => {
    const svc = new LendingService(null, { pool: fakePool() });

    const dash = await svc.getLenderDashboard(WALLET);

    expect(dash.walletAddress).toBe(WALLET);
    expect(dash.shares).toBe('95000000');
    expect(dash.assets).toBe('100000000');
    expect(dash.maxWithdraw).toBe('100000000');
    expect(dash).not.toHaveProperty('positions');
  });

  it('skips the conversion for a wallet with no shares', async () => {
    const pool = fakePool({ balanceOf: vi.fn(async () => 0n), maxWithdraw: vi.fn(async () => 0n) });
    const svc = new LendingService(null, { pool });

    const dash = await svc.getLenderDashboard(WALLET);

    expect(dash.assets).toBe('0');
    expect(pool.convertToAssets).not.toHaveBeenCalled();
  });

  it('projects simple interest at a given rate', async () => {
    const svc = new LendingService(null, { pool: fakePool() });
    const p = await svc.getProjections('1000000000', '540');
    expect(p['1y']).toBe('54000000');
  });
});
