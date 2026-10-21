/**
 * Vestra liquidation keeper.
 *
 * Every KEEPER_INTERVAL_MS (default 60s) it scans all LoanManager loans and
 *  - calls startLiquidation(loanId) for any Active loan where isLiquidatable() is true,
 *  - calls restartAuction(loanId) for any auction whose round ended without a bid.
 * Until startLiquidation is called, an expected loss is not booked against lenders,
 * so this should run continuously in production.
 *
 * Usage: tsx scripts/vestraKeeper.ts [--once]
 * Env:   SEPOLIA_HTTP_RPC, SEPOLIA_LOAN_MANAGER, EVM_RELAYER_PRIVATE_KEY (or PRIVATE_KEY)
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { runKeeperPass } from '../src/keeper/liquidationKeeper';

// Load env from root or current dir
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const KEEPER_KEY = (process.env.EVM_RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY) as `0x${string}`;
const LOAN_MANAGER = process.env.SEPOLIA_LOAN_MANAGER as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_HTTP_RPC!;
const INTERVAL_MS = Math.max(10_000, Number(process.env.KEEPER_INTERVAL_MS || 60_000));

if (!KEEPER_KEY || !LOAN_MANAGER || !RPC_URL) {
  console.error('[VestraKeeper] SEPOLIA_HTTP_RPC, SEPOLIA_LOAN_MANAGER and EVM_RELAYER_PRIVATE_KEY are required');
  process.exit(1);
}

const account = privateKeyToAccount(KEEPER_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

// Closed loans never reopen, so skip them on later passes.
const closedLoanIds = new Set<bigint>();

async function pulse() {
  const outcomes = await runKeeperPass({ publicClient, walletClient, loanManager: LOAN_MANAGER, closedLoanIds });
  const failed = outcomes.filter((o) => o.error).length;
  console.log(`[VestraKeeper] Pass complete: ${outcomes.length - failed} sent, ${failed} failed.`);
}

async function main() {
  console.log(`[VestraKeeper] Keeper ${account.address} watching LoanManager ${LOAN_MANAGER}`);
  if (process.argv.includes('--once')) {
    await pulse();
    return;
  }
  for (;;) {
    await pulse().catch((err) => console.error('[VestraKeeper] Pass failed:', err));
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
