import { describe, it, expect, vi } from 'vitest';
import { runKeeperPass, planLoanAction, type KeeperPublicClient } from './liquidationKeeper';
import { LoanStatus } from '../contracts/vestraAbi';

const LOAN_MANAGER = '0x00000000000000000000000000000000000000aa' as const;
const NOW = 1_800_000_000n;

interface FakeLoan {
  status: LoanStatus;
  liquidatable?: boolean;
  auction?: { startTime: bigint; duration: bigint };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function fakeChain(loans: Record<number, FakeLoan>, opts: { simulateFails?: Set<bigint> } = {}) {
  const readContract = vi.fn(async ({ functionName, args }: any) => {
    const id = args ? Number(args[0]) : 0;
    switch (functionName) {
      case 'nextLoanId':
        return BigInt(Object.keys(loans).length + 1);
      case 'getLoan':
        return { status: loans[id].status };
      case 'isLiquidatable':
        return Boolean(loans[id].liquidatable);
      case 'auctions': {
        const a = loans[id].auction ?? { startTime: 0n, duration: 0n };
        return [a.startTime, a.duration, 0n, 0n, 0n, 0n, 0n, 0n];
      }
      default:
        throw new Error(`unexpected read ${functionName}`);
    }
  });
  const simulateContract = vi.fn(async (args: any) => {
    if (opts.simulateFails?.has(args.args[0])) throw Object.assign(new Error('reverted'), { shortMessage: 'not liquidatable' });
    return { request: { functionName: args.functionName, args: args.args } };
  });
  const publicClient: KeeperPublicClient = {
    getBlock: vi.fn(async () => ({ timestamp: NOW })),
    readContract,
    simulateContract,
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' as const })),
  };
  let n = 0;
  const walletClient = {
    account: '0x00000000000000000000000000000000000000bb' as const,
    writeContract: vi.fn(async () => `0x${(++n).toString(16).padStart(64, '0')}` as `0x${string}`),
  };
  return { publicClient, walletClient, readContract, simulateContract };
}

describe('planLoanAction', () => {
  it('starts liquidation only for active loans that are liquidatable', async () => {
    const { publicClient } = fakeChain({
      1: { status: LoanStatus.Active, liquidatable: true },
      2: { status: LoanStatus.Active, liquidatable: false },
    });
    expect(await planLoanAction(publicClient, LOAN_MANAGER, 1n, NOW)).toBe('startLiquidation');
    expect(await planLoanAction(publicClient, LOAN_MANAGER, 2n, NOW)).toBeNull();
  });

  it('restarts an auction exactly when its round is over', async () => {
    const { publicClient } = fakeChain({
      1: { status: LoanStatus.Auction, auction: { startTime: NOW - 100n, duration: 100n } }, // ends now
      2: { status: LoanStatus.Auction, auction: { startTime: NOW - 99n, duration: 100n } },  // 1s left
    });
    expect(await planLoanAction(publicClient, LOAN_MANAGER, 1n, NOW)).toBe('restartAuction');
    expect(await planLoanAction(publicClient, LOAN_MANAGER, 2n, NOW)).toBeNull();
  });

  it('ignores closed loans and remembers them', async () => {
    const { publicClient, readContract } = fakeChain({
      1: { status: LoanStatus.Repaid },
      2: { status: LoanStatus.Liquidated },
    });
    const closed = new Set<bigint>();
    expect(await planLoanAction(publicClient, LOAN_MANAGER, 1n, NOW, closed)).toBeNull();
    expect(await planLoanAction(publicClient, LOAN_MANAGER, 2n, NOW, closed)).toBeNull();
    expect([...closed]).toEqual([1n, 2n]);
    expect(readContract.mock.calls.map((c: any) => c[0].functionName)).toEqual(['getLoan', 'getLoan']);
  });
});

describe('runKeeperPass', () => {
  it('sends startLiquidation and restartAuction for the right loans only', async () => {
    const { publicClient, walletClient } = fakeChain({
      1: { status: LoanStatus.Active, liquidatable: true },
      2: { status: LoanStatus.Active, liquidatable: false },
      3: { status: LoanStatus.Auction, auction: { startTime: NOW - 3n * 86400n, duration: 3n * 86400n } },
      4: { status: LoanStatus.Auction, auction: { startTime: NOW - 60n, duration: 3n * 86400n } },
      5: { status: LoanStatus.Repaid },
    });

    const outcomes = await runKeeperPass({ publicClient, walletClient, loanManager: LOAN_MANAGER, logger: silentLogger });

    expect(outcomes.map((o) => [o.loanId, o.action, !!o.txHash])).toEqual([
      [1n, 'startLiquidation', true],
      [3n, 'restartAuction', true],
    ]);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(2);
    expect(walletClient.writeContract.mock.calls.map((c: any) => c[0].functionName)).toEqual(['startLiquidation', 'restartAuction']);
  });

  it('does not send a transaction when simulation reverts, and keeps going', async () => {
    const { publicClient, walletClient } = fakeChain(
      {
        1: { status: LoanStatus.Active, liquidatable: true },
        2: { status: LoanStatus.Active, liquidatable: true },
      },
      { simulateFails: new Set([1n]) }
    );

    const outcomes = await runKeeperPass({ publicClient, walletClient, loanManager: LOAN_MANAGER, logger: silentLogger });

    expect(outcomes[0]).toMatchObject({ loanId: 1n, action: 'startLiquidation', error: 'not liquidatable' });
    expect(outcomes[1]).toMatchObject({ loanId: 2n, action: 'startLiquidation' });
    expect(outcomes[1].txHash).toBeDefined();
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
  });

  it('skips loans already known to be closed on later passes', async () => {
    const { publicClient, walletClient, readContract } = fakeChain({
      1: { status: LoanStatus.Repaid },
      2: { status: LoanStatus.Active, liquidatable: false },
    });
    const closedLoanIds = new Set<bigint>();

    await runKeeperPass({ publicClient, walletClient, loanManager: LOAN_MANAGER, logger: silentLogger, closedLoanIds });
    readContract.mockClear();
    await runKeeperPass({ publicClient, walletClient, loanManager: LOAN_MANAGER, logger: silentLogger, closedLoanIds });

    const getLoanIds = readContract.mock.calls
      .filter((c: any) => c[0].functionName === 'getLoan')
      .map((c: any) => c[0].args[0]);
    expect(getLoanIds).toEqual([2n]);
  });

  it('reports a reverted receipt as a failure', async () => {
    const { publicClient, walletClient } = fakeChain({ 1: { status: LoanStatus.Active, liquidatable: true } });
    (publicClient.waitForTransactionReceipt as any).mockResolvedValueOnce({ status: 'reverted' });

    const [outcome] = await runKeeperPass({ publicClient, walletClient, loanManager: LOAN_MANAGER, logger: silentLogger });

    expect(outcome.error).toMatch(/reverted/);
  });

  it('does nothing when there are no loans', async () => {
    const { publicClient, walletClient } = fakeChain({});
    expect(await runKeeperPass({ publicClient, walletClient, loanManager: LOAN_MANAGER, logger: silentLogger })).toEqual([]);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });
});
