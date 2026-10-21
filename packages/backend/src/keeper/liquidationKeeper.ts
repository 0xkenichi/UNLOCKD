/**
 * liquidationKeeper.ts
 * One keeper pass over every LoanManager loan:
 *  - Active loan with isLiquidatable() → startLiquidation(loanId)
 *  - Auction whose round has ended without a bid → restartAuction(loanId)
 *
 * Both calls are permissionless. Every write is simulated first so a loan that changed
 * state since it was read (repaid, bid on, already started by another keeper) costs no gas.
 * Bidding is left to buyers; the keeper never spends USDC.
 */
import type { Address } from 'viem';
import { LOAN_MANAGER_ABI, LoanStatus } from '../contracts/vestraAbi';

export type KeeperAction = 'startLiquidation' | 'restartAuction';

export interface KeeperOutcome {
  loanId: bigint;
  action: KeeperAction;
  txHash?: `0x${string}`;
  error?: string;
}

// Structural subsets of viem's PublicClient / WalletClient, so tests can pass plain mocks.
export interface KeeperPublicClient {
  getBlock(): Promise<{ timestamp: bigint }>;
  readContract(args: any): Promise<any>;
  simulateContract(args: any): Promise<{ request: any }>;
  waitForTransactionReceipt?(args: { hash: `0x${string}` }): Promise<{ status: 'success' | 'reverted' }>;
}

export interface KeeperWalletClient {
  account?: { address: Address } | Address;
  writeContract(request: any): Promise<`0x${string}`>;
}

export interface KeeperLogger {
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

export interface KeeperOptions {
  publicClient: KeeperPublicClient;
  walletClient: KeeperWalletClient;
  loanManager: Address;
  logger?: KeeperLogger;
  /** Parallel RPC reads while scanning loans. */
  concurrency?: number;
  /** Wait for each transaction to be mined before moving on. */
  waitForReceipts?: boolean;
  /** Loan ids known to be closed (Repaid/Liquidated); reused across passes to skip them. */
  closedLoanIds?: Set<bigint>;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Decide what (if anything) the keeper should do for one loan. */
export async function planLoanAction(
  publicClient: KeeperPublicClient,
  loanManager: Address,
  loanId: bigint,
  now: bigint,
  closedLoanIds?: Set<bigint>
): Promise<KeeperAction | null> {
  const read = (functionName: string, args: unknown[]) =>
    publicClient.readContract({ address: loanManager, abi: LOAN_MANAGER_ABI, functionName, args });

  const loan = await read('getLoan', [loanId]);
  const status = Number(loan.status);

  if (status === LoanStatus.Repaid || status === LoanStatus.Liquidated) {
    closedLoanIds?.add(loanId);
    return null;
  }

  if (status === LoanStatus.Active) {
    return (await read('isLiquidatable', [loanId])) ? 'startLiquidation' : null;
  }

  if (status === LoanStatus.Auction) {
    const [startTime, duration] = await read('auctions', [loanId]);
    return now >= BigInt(startTime) + BigInt(duration) ? 'restartAuction' : null;
  }

  return null;
}

export async function runKeeperPass(opts: KeeperOptions): Promise<KeeperOutcome[]> {
  const { publicClient, walletClient, loanManager, logger = console, concurrency = 8, waitForReceipts = true } = opts;
  const closed = opts.closedLoanIds;

  const [block, nextLoanId] = await Promise.all([
    publicClient.getBlock(),
    publicClient.readContract({ address: loanManager, abi: LOAN_MANAGER_ABI, functionName: 'nextLoanId' }) as Promise<bigint>,
  ]);

  const ids: bigint[] = [];
  for (let id = 1n; id < nextLoanId; id++) if (!closed?.has(id)) ids.push(id);

  const plans = await mapWithConcurrency(ids, concurrency, async (loanId) => {
    try {
      return { loanId, action: await planLoanAction(publicClient, loanManager, loanId, block.timestamp, closed) };
    } catch (err: any) {
      logger.warn(`[VestraKeeper] Could not read loan ${loanId}: ${err?.shortMessage || err?.message || err}`);
      return { loanId, action: null };
    }
  });

  const outcomes: KeeperOutcome[] = [];
  // Writes are sent one at a time so the wallet's nonces stay in order.
  for (const { loanId, action } of plans) {
    if (!action) continue;
    try {
      const { request } = await publicClient.simulateContract({
        account: walletClient.account,
        address: loanManager,
        abi: LOAN_MANAGER_ABI,
        functionName: action,
        args: [loanId],
      });
      const txHash = await walletClient.writeContract(request);
      if (waitForReceipts && publicClient.waitForTransactionReceipt) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') throw new Error(`transaction ${txHash} reverted`);
      }
      logger.info(`[VestraKeeper] ${action}(${loanId}) sent: ${txHash}`);
      outcomes.push({ loanId, action, txHash });
    } catch (err: any) {
      const error = err?.shortMessage || err?.message || String(err);
      logger.error(`[VestraKeeper] ${action}(${loanId}) failed: ${error}`);
      outcomes.push({ loanId, action, error });
    }
  }

  return outcomes;
}
