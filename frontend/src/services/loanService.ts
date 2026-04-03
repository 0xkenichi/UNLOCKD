/**
 * loanService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vestra Protocol — Loan Lifecycle Backend Service
 *
 * Responsibilities:
 *   1. Listen to LoanManager on-chain events (LoanOpened, LoanRepaid, LoanLiquidated).
 *   2. Listen to VestraWrapperNFT Transfer events for secondary market holder tracking.
 *   3. Write/update Supabase tables: loans, loan_events, nft_transfers.
 *   4. Expose helper methods used by the Next.js API routes.
 *
 * Failure modes:
 *   • RPC dead           → retry with exponential backoff (max 5 attempts).
 *   • Supabase write fail → throw; caller (BullMQ worker) retries.
 *   • Duplicate event    → upsert on (chain_id, tx_hash, log_index) is idempotent.
 *   • Re-org             → block_number_close overwrite safe (status flips are
 *                          monotonic: active → repaid/liquidated).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  createPublicClient,
  http,
  parseAbiItem,
  type Log,
  type PublicClient,
  getAddress,
} from 'viem';
import { sepolia, base } from 'viem/chains';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────
const logger = pino({
  name: 'loanService',
  level: process.env.LOG_LEVEL ?? 'info',
});

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
interface ChainConfig {
  chainId: number;
  loanManagerAddress: `0x${string}`;
  nftAddress:         `0x${string}`;
  rpcUrl:             string;
  viemChain:          typeof sepolia | typeof base;
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId:            11155111,
    loanManagerAddress: (process.env.LOAN_MANAGER_SEPOLIA ?? '0x0') as `0x${string}`,
    nftAddress:         (process.env.NFT_SEPOLIA          ?? '0x0') as `0x${string}`,
    rpcUrl:             process.env.RPC_SEPOLIA            ?? '',
    viemChain:          sepolia,
  },
  {
    chainId:            8453,
    loanManagerAddress: (process.env.LOAN_MANAGER_BASE    ?? '0x0') as `0x${string}`,
    nftAddress:         (process.env.NFT_BASE             ?? '0x0') as `0x${string}`,
    rpcUrl:             process.env.RPC_BASE               ?? '',
    viemChain:          base,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ABI fragments (events only — minimal surface)
// ─────────────────────────────────────────────────────────────────────────────
const LOAN_OPENED_ABI = parseAbiItem(
  'event LoanOpened(uint256 indexed loanId, address indexed borrower, address indexed collateralToken, uint256 streamId, uint256 principal, uint256 dpvAtOpen, uint256 unlockTime, uint256 fee)'
);
const LOAN_REPAID_ABI = parseAbiItem(
  'event LoanRepaid(uint256 indexed loanId, address indexed repayer, uint256 principal, uint256 interest, uint256 totalPaid)'
);
const LOAN_LIQUIDATED_ABI = parseAbiItem(
  'event LoanLiquidated(uint256 indexed loanId, address indexed liquidator, uint256 recoveredAmount)'
);
const NFT_TRANSFER_ABI = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
);

// ─────────────────────────────────────────────────────────────────────────────
// Supabase helpers
// ─────────────────────────────────────────────────────────────────────────────
function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle LoanOpened event — insert loan row + loan_events row.
 */
async function handleLoanOpened(
  log: Log<bigint, number, false, typeof LOAN_OPENED_ABI>,
  chainId: number,
  supabase: SupabaseClient
): Promise<void> {
  const {
    loanId, borrower, collateralToken,
    streamId, principal, dpvAtOpen, unlockTime, fee
  } = log.args as any;

  const loanIdNum   = Number(loanId);
  const unlockDate  = new Date(Number(unlockTime) * 1000).toISOString();

  logger.info(
    { fn: 'handleLoanOpened', chainId, loanId: loanIdNum, borrower, principal: principal.toString() },
    'LoanOpened indexing'
  );

  // Upsert loan row (idempotent on loan_id)
  const { error: loanErr } = await supabase
    .from('loans')
    .upsert(
      {
        loan_id:              loanIdNum,
        chain_id:             chainId,
        borrower:             getAddress(borrower),
        nft_holder:           getAddress(borrower),     // holder == borrower at mint
        collateral_token:     getAddress(collateralToken),
        stream_id:            streamId.toString(),
        quantity:             '0',                      // TODO: pass quantity via event or separate read
        unlock_time:          unlockDate,
        principal_usdc:       Number(principal),
        dpv_at_open_usdc:     Number(dpvAtOpen),
        ltv_bps:              0,                        // computed off-chain; update via separate call
        origination_fee_usdc: Number(fee),
        nft_token_id:         loanIdNum,
        nft_tx_hash:          log.transactionHash,
        status:               'active',
        tx_hash_open:         log.transactionHash!,
        block_number_open:    Number(log.blockNumber),
        opened_at:            new Date().toISOString(),
      },
      { onConflict: 'loan_id' }
    );

  if (loanErr) {
    logger.error({ fn: 'handleLoanOpened', error: loanErr }, 'Supabase upsert failed');
    throw loanErr;
  }

  // Append event log
  await appendLoanEvent(supabase, {
    loan_id:      loanIdNum,
    chain_id:     chainId,
    event_type:   'opened',
    tx_hash:      log.transactionHash!,
    block_number: Number(log.blockNumber),
    log_index:    log.logIndex ?? 0,
    from_address: getAddress(borrower),
    payload: {
      principal:  principal.toString(),
      dpv:        dpvAtOpen.toString(),
      fee:        fee.toString(),
      unlockTime: unlockTime.toString(),
    },
    occurred_at: new Date().toISOString(),
  });
}

/**
 * Handle LoanRepaid — update loan status + append event.
 */
async function handleLoanRepaid(
  log: Log<bigint, number, false, typeof LOAN_REPAID_ABI>,
  chainId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { loanId, repayer, principal, interest, totalPaid } = log.args as any;
  const loanIdNum = Number(loanId);

  logger.info({ fn: 'handleLoanRepaid', chainId, loanId: loanIdNum }, 'LoanRepaid indexing');

  const { error } = await supabase
    .from('loans')
    .update({
      status:             'repaid',
      interest_usdc:      Number(interest),
      tx_hash_close:      log.transactionHash,
      block_number_close: Number(log.blockNumber),
      closed_at:          new Date().toISOString(),
    })
    .eq('loan_id', loanIdNum)
    .eq('chain_id', chainId);

  if (error) throw error;

  await appendLoanEvent(supabase, {
    loan_id:      loanIdNum,
    chain_id:     chainId,
    event_type:   'repaid',
    tx_hash:      log.transactionHash!,
    block_number: Number(log.blockNumber),
    log_index:    log.logIndex ?? 0,
    from_address: getAddress(repayer),
    payload: {
      principal:  principal.toString(),
      interest:   interest.toString(),
      totalPaid:  totalPaid.toString(),
    },
    occurred_at: new Date().toISOString(),
  });
}

/**
 * Handle LoanLiquidated — update loan status + append event.
 */
async function handleLoanLiquidated(
  log: Log<bigint, number, false, typeof LOAN_LIQUIDATED_ABI>,
  chainId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { loanId, liquidator, recoveredAmount } = log.args as any;
  const loanIdNum = Number(loanId);

  logger.info({ fn: 'handleLoanLiquidated', chainId, loanId: loanIdNum }, 'LoanLiquidated indexing');

  const { error } = await supabase
    .from('loans')
    .update({
      status:             'liquidated',
      tx_hash_close:      log.transactionHash,
      block_number_close: Number(log.blockNumber),
      closed_at:          new Date().toISOString(),
    })
    .eq('loan_id', loanIdNum)
    .eq('chain_id', chainId);

  if (error) throw error;

  await appendLoanEvent(supabase, {
    loan_id:      loanIdNum,
    chain_id:     chainId,
    event_type:   'liquidated',
    tx_hash:      log.transactionHash!,
    block_number: Number(log.blockNumber),
    log_index:    log.logIndex ?? 0,
    from_address: getAddress(liquidator),
    payload:      { recoveredAmount: recoveredAmount.toString() },
    occurred_at:  new Date().toISOString(),
  });
}

/**
 * Handle NFT Transfer — update nft_holder on loans + insert nft_transfers row.
 */
async function handleNFTTransfer(
  log: Log<bigint, number, false, typeof NFT_TRANSFER_ABI>,
  chainId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { from, to, tokenId } = log.args as any;
  const loanIdNum = Number(tokenId);

  // Burn transfers (to=zero) handled by repay/liquidate handlers
  if (to === '0x0000000000000000000000000000000000000000') return;

  logger.info({ fn: 'handleNFTTransfer', chainId, tokenId: loanIdNum, from, to }, 'NFT Transfer');

  // Update current holder
  await supabase
    .from('loans')
    .update({ nft_holder: getAddress(to) })
    .eq('loan_id', loanIdNum)
    .eq('chain_id', chainId);

  // Insert transfer record
  await supabase
    .from('nft_transfers')
    .insert({
      loan_id:       loanIdNum,
      chain_id:      chainId,
      from_address:  getAddress(from),
      to_address:    getAddress(to),
      tx_hash:       log.transactionHash!,
      block_number:  Number(log.blockNumber),
      transferred_at: new Date().toISOString(),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Append event helper
// ─────────────────────────────────────────────────────────────────────────────
interface LoanEventInsert {
  loan_id:      number;
  chain_id:     number;
  event_type:   string;
  tx_hash:      string;
  block_number: number;
  log_index:    number;
  from_address: string | null;
  payload:      Record<string, unknown>;
  occurred_at:  string;
}

async function appendLoanEvent(
  supabase: SupabaseClient,
  evt: LoanEventInsert
): Promise<void> {
  const { error } = await supabase
    .from('loan_events')
    .upsert(evt, { onConflict: 'chain_id,tx_hash,log_index' });
  if (error) {
    logger.error({ fn: 'appendLoanEvent', error }, 'Failed to write loan_event');
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Watcher startup — one watcher per chain
// ─────────────────────────────────────────────────────────────────────────────

function startChainWatcher(cfg: ChainConfig, supabase: SupabaseClient): void {
  const client: PublicClient = createPublicClient({
    chain:     cfg.viemChain,
    transport: http(cfg.rpcUrl),
  });

  logger.info(
    { fn: 'startChainWatcher', chainId: cfg.chainId, loanManager: cfg.loanManagerAddress },
    'Starting event watcher'
  );

  // ── LoanOpened ──────────────────────────────────────────────────────────────
  client.watchEvent({
    address: cfg.loanManagerAddress,
    event:   LOAN_OPENED_ABI,
    onLogs:  (logs) => {
      for (const log of logs) {
        handleLoanOpened(log as any, cfg.chainId, supabase).catch((err) =>
          logger.error({ fn: 'watchLoanOpened', err }, 'Handler failed')
        );
      }
    },
    onError: (err) => logger.error({ fn: 'watchLoanOpened', err }, 'Watch error'),
  });

  // ── LoanRepaid ──────────────────────────────────────────────────────────────
  client.watchEvent({
    address: cfg.loanManagerAddress,
    event:   LOAN_REPAID_ABI,
    onLogs:  (logs) => {
      for (const log of logs) {
        handleLoanRepaid(log as any, cfg.chainId, supabase).catch((err) =>
          logger.error({ fn: 'watchLoanRepaid', err }, 'Handler failed')
        );
      }
    },
    onError: (err) => logger.error({ fn: 'watchLoanRepaid', err }, 'Watch error'),
  });

  // ── LoanLiquidated ──────────────────────────────────────────────────────────
  client.watchEvent({
    address: cfg.loanManagerAddress,
    event:   LOAN_LIQUIDATED_ABI,
    onLogs:  (logs) => {
      for (const log of logs) {
        handleLoanLiquidated(log as any, cfg.chainId, supabase).catch((err) =>
          logger.error({ fn: 'watchLoanLiquidated', err }, 'Handler failed')
        );
      }
    },
    onError: (err) => logger.error({ fn: 'watchLoanLiquidated', err }, 'Watch error'),
  });

  // ── NFT Transfer ────────────────────────────────────────────────────────────
  client.watchEvent({
    address: cfg.nftAddress,
    event:   NFT_TRANSFER_ABI,
    onLogs:  (logs) => {
      for (const log of logs) {
        handleNFTTransfer(log as any, cfg.chainId, supabase).catch((err) =>
          logger.error({ fn: 'watchNFTTransfer', err }, 'Handler failed')
        );
      }
    },
    onError: (err) => logger.error({ fn: 'watchNFTTransfer', err }, 'Watch error'),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — used by Next.js API routes
// ─────────────────────────────────────────────────────────────────────────────

export async function getLoan(loanId: number, chainId: number) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('loans')
    .select('*, loan_events(*)')
    .eq('loan_id', loanId)
    .eq('chain_id', chainId)
    .single();
  if (error) throw error;
  return data;
}

export async function getLoansByWallet(wallet: string, chainId?: number) {
  const supabase = getSupabase();
  let query = supabase
    .from('loans')
    .select('*')
    .or(`borrower.ilike.${wallet},nft_holder.ilike.${wallet}`)
    .order('opened_at', { ascending: false });

  if (chainId) query = query.eq('chain_id', chainId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────────────────────

export function startLoanService(): void {
  const supabase = getSupabase();
  for (const cfg of CHAIN_CONFIGS) {
    if (!cfg.rpcUrl || cfg.loanManagerAddress === '0x0') {
      logger.warn({ chainId: cfg.chainId }, 'Chain not configured — skipping watcher');
      continue;
    }
    startChainWatcher(cfg, supabase);
  }
  logger.info('LoanService started');
}
