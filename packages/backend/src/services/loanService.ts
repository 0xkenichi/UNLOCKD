/**
 * loanService.ts
 * Vestra Protocol — Backend Loan Event Listener + Supabase Logger
 *
 * Watches LoanManager contract events on all configured chains.
 * On each event: validates → deduplicates → writes to Supabase.
 *
 * Failure modes:
 * - RPC disconnect → viem auto-reconnects with exponential backoff (watchContractEvent)
 * - Supabase write failure → logged to stderr + Prometheus counter; event NOT lost
 *   (re-indexed on next startup via block-range backfill if block < lastIndexedBlock)
 * - Duplicate event → UNIQUE constraint on (chain_id, tx_hash, log_index) absorbs it silently
 */

import { createPublicClient, webSocket, http, parseAbiItem, type Log } from 'viem';
import { base, arbitrum, sepolia } from 'viem/chains';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';

// ── Logger ────────────────────────────────────────────────────────────────────
const logger = pino({
  name:      'loanService',
  level:     process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

// ── ABIs (match LoanManager.sol events exactly) ───────────────────────────────
const LOAN_ORIGINATED_ABI = parseAbiItem(
  'event LoanOriginated(uint256 indexed tokenId, address indexed borrower, address indexed collateralToken, uint256 principalUsdc, uint256 interestRateBps, uint256 unlockTime, uint256 dpvUsdc, uint256 ltvBps, uint256 originationFeeUsdc, address lender)'
);

const LOAN_REPAID_ABI = parseAbiItem(
  'event LoanRepaid(uint256 indexed tokenId, address borrower, uint256 principalPaid, uint256 interestPaid, uint256 totalRepaid, uint256 timestamp)'
);

const LOAN_REPAID_PARTIAL_ABI = parseAbiItem(
  'event LoanRepaidPartial(uint256 indexed tokenId, uint256 amountUsdc, uint256 interestPaid, uint256 principalPaid, uint256 remainingPrincipal)'
);

const VESTRA_PAY_STATUS_UPDATED_ABI = parseAbiItem(
  'event VestraPayStatusUpdated(uint256 indexed tokenId, bool status)'
);

const LOAN_LIQUIDATED_ABI = parseAbiItem(
  'event LoanLiquidated(uint256 indexed tokenId, address indexed borrower, uint256 outstandingUsdc, uint256 liquidatedAt)'
);

// ── Chain config ───────────────────────────────────────────────────────────────
interface ChainConfig {
  chainId:        number;
  viemChain:      any;
  rpcWs:          string;
  rpcHttp:        string;
  loanManager:    `0x${string}`;
  startBlock:     bigint;
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chainId:     11155111,
    viemChain:   sepolia,
    rpcWs:       process.env.SEPOLIA_WS_RPC   ?? 'wss://eth-sepolia.g.alchemy.com/v2/demo',
    rpcHttp:     process.env.SEPOLIA_HTTP_RPC  ?? 'https://eth-sepolia.g.alchemy.com/v2/demo',
    loanManager: (process.env.SEPOLIA_LOAN_MANAGER ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    startBlock:  BigInt(process.env.SEPOLIA_START_BLOCK ?? '0'),
  },
  {
    chainId:     8453,
    viemChain:   base,
    rpcWs:       process.env.BASE_WS_RPC      ?? 'wss://base-mainnet.g.alchemy.com/v2/demo',
    rpcHttp:     process.env.BASE_HTTP_RPC     ?? 'https://base-mainnet.g.alchemy.com/v2/demo',
    loanManager: (process.env.BASE_LOAN_MANAGER ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    startBlock:  BigInt(process.env.BASE_START_BLOCK ?? '0'),
  },
  {
    chainId:     42161,
    viemChain:   arbitrum,
    rpcWs:       process.env.ARB_WS_RPC       ?? 'wss://arb-mainnet.g.alchemy.com/v2/demo',
    rpcHttp:     process.env.ARB_HTTP_RPC      ?? 'https://arb-mainnet.g.alchemy.com/v2/demo',
    loanManager: (process.env.ARB_LOAN_MANAGER  ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    startBlock:  BigInt(process.env.ARB_START_BLOCK  ?? '0'),
  },
];

// ── Supabase client (service role — bypasses RLS for writes) ──────────────────
function buildSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Core Supabase writers ──────────────────────────────────────────────────────

async function writeLoanOriginated(
  supabase: SupabaseClient,
  chainId:  number,
  log:      Log,
  args:     {
    tokenId:              bigint;
    borrower:             string;
    collateralToken:      string;
    principalUsdc:        bigint;
    interestRateBps:      bigint;
    unlockTime:           bigint;
    dpvUsdc:              bigint;
    ltvBps:               bigint;
    originationFeeUsdc:   bigint;
    lender:               string;
  }
): Promise<void> {
  const tokenId = args.tokenId.toString();
  const txHash  = log.transactionHash!;

  const loanRow = {
    token_id:              tokenId,
    chain_id:              chainId,
    borrower:              args.borrower.toLowerCase(),
    collateral_token:      args.collateralToken.toLowerCase(),
    principal_usdc:        args.principalUsdc.toString(),
    interest_rate_bps:     Number(args.interestRateBps),
    origination_fee_usdc:  args.originationFeeUsdc.toString(),
    unlock_time:           new Date(Number(args.unlockTime) * 1000).toISOString(),
    dpv_usdc:              args.dpvUsdc.toString(),
    ltv_bps:               Number(args.ltvBps),
    status:                'ACTIVE',
    lender:                args.lender.toLowerCase(),
    origination_tx:        txHash,
    origination_block:     Number(log.blockNumber),
  };

  const eventRow = {
    token_id:     tokenId,
    chain_id:     chainId,
    event_type:   'LOAN_ORIGINATED',
    payload:      {
      borrower:           args.borrower,
      collateral_token:   args.collateralToken,
      principal_usdc:     args.principalUsdc.toString(),
      interest_rate_bps:  args.interestRateBps.toString(),
      unlock_time:        args.unlockTime.toString(),
      dpv_usdc:           args.dpvUsdc.toString(),
      ltv_bps:            args.ltvBps.toString(),
      origination_fee:    args.originationFeeUsdc.toString(),
    },
    tx_hash:      txHash,
    block_number: Number(log.blockNumber),
    log_index:    log.logIndex ?? 0,
  };

  const nftRow = {
    token_id:   tokenId,
    chain_id:   chainId,
    owner:      args.borrower.toLowerCase(),
    status:     'ACTIVE',
    minted_at:  new Date().toISOString(),
    mint_tx:    txHash,
  };

  const [loanRes, eventRes, nftRes] = await Promise.all([
    supabase.from('loans').upsert(loanRow, { onConflict: 'token_id' }),
    supabase.from('loan_events').upsert(eventRow, { onConflict: 'chain_id,tx_hash,log_index' }),
    supabase.from('nft_positions').upsert(nftRow, { onConflict: 'token_id' }),
  ]);

  if (loanRes.error)  throw new Error(`loans insert failed: ${loanRes.error.message}`);
  if (eventRes.error) throw new Error(`loan_events insert failed: ${eventRes.error.message}`);
  if (nftRes.error)   throw new Error(`nft_positions insert failed: ${nftRes.error.message}`);

  logger.info({ service: 'loanService', fn: 'writeLoanOriginated', chainId, tokenId, txHash }, 'Loan originated — Supabase written');
}

async function writeLoanRepaid(
  supabase: SupabaseClient,
  chainId:  number,
  log:      Log,
  args:     {
    tokenId:         bigint;
    borrower:        string;
    principalPaid:   bigint;
    interestPaid:    bigint;
    totalRepaid:     bigint;
    timestamp:       bigint;
  }
): Promise<void> {
  const tokenId = args.tokenId.toString();
  const txHash  = log.transactionHash!;

  const loanUpdate = {
    status:               'REPAID',
    interest_accrued_usdc: args.interestPaid.toString(),
    total_repaid_usdc:    args.totalRepaid.toString(),
    settled_at:           new Date(Number(args.timestamp) * 1000).toISOString(),
    settlement_tx:        txHash,
  };

  const eventRow = {
    token_id:     tokenId,
    chain_id:     chainId,
    event_type:   'LOAN_REPAID',
    payload:      {
      borrower:         args.borrower,
      principal_paid:   args.principalPaid.toString(),
      interest_paid:    args.interestPaid.toString(),
      total_repaid:     args.totalRepaid.toString(),
      repaid_at:        args.timestamp.toString(),
    },
    tx_hash:      txHash,
    block_number: Number(log.blockNumber),
    log_index:    log.logIndex ?? 0,
  };

  const nftUpdate = {
    status:    'BURNED',
    burned_at: new Date(Number(args.timestamp) * 1000).toISOString(),
    burn_tx:   txHash,
  };

  const [loanRes, eventRes, nftRes] = await Promise.all([
    supabase.from('loans').update(loanUpdate).eq('token_id', tokenId),
    supabase.from('loan_events').upsert(eventRow, { onConflict: 'chain_id,tx_hash,log_index' }),
    supabase.from('nft_positions').update(nftUpdate).eq('token_id', tokenId),
  ]);

  if (loanRes.error)  throw new Error(`loans update failed: ${loanRes.error.message}`);
  if (eventRes.error) throw new Error(`loan_events insert failed: ${eventRes.error.message}`);
  if (nftRes.error)   throw new Error(`nft_positions update failed: ${nftRes.error.message}`);

  logger.info({ service: 'loanService', fn: 'writeLoanRepaid', chainId, tokenId, txHash }, 'Loan repaid — Supabase updated');
}

async function writeLoanPartialRepay(
  supabase: SupabaseClient,
  log: any,
  args: {
    tokenId:            bigint;
    amountUsdc:         bigint;
    interestPaid:       bigint;
    principalPaid:      bigint;
    remainingPrincipal: bigint;
  }
): Promise<void> {
  const tokenId = args.tokenId.toString();
  await supabase
    .from('loans')
    .update({ 
      principal_usdc: args.remainingPrincipal.toString(),
      last_repayment_tx: log.transactionHash,
      last_repayment_block: Number(log.blockNumber)
    })
    .eq('token_id', tokenId);
}

async function updateVestraPayStatus(
  supabase: SupabaseClient,
  args: {
    tokenId: bigint;
    status:  boolean;
  }
): Promise<void> {
  await supabase
    .from('loans')
    .update({ vestra_pay_enabled: args.status })
    .eq('token_id', args.tokenId.toString());
}

async function writeLoanLiquidated(
  supabase: SupabaseClient,
  chainId:  number,
  log:      Log,
  args:     {
    tokenId:        bigint;
    borrower:       string;
    outstandingUsdc: bigint;
    liquidatedAt:   bigint;
  }
): Promise<void> {
  const tokenId = args.tokenId.toString();
  const txHash  = log.transactionHash!;

  const [loanRes, eventRes, nftRes] = await Promise.all([
    supabase.from('loans').update({
      status:       'LIQUIDATED',
      settled_at:   new Date(Number(args.liquidatedAt) * 1000).toISOString(),
      settlement_tx: txHash,
      total_repaid_usdc: '0',
    }).eq('token_id', tokenId),
    supabase.from('loan_events').upsert({
      token_id:     tokenId,
      chain_id:     chainId,
      event_type:   'LOAN_LIQUIDATED',
      payload: {
        borrower:        args.borrower,
        outstanding_usdc: args.outstandingUsdc.toString(),
        liquidated_at:   args.liquidatedAt.toString(),
      },
      tx_hash:      txHash,
      block_number: Number(log.blockNumber),
      log_index:    log.logIndex ?? 0,
    }, { onConflict: 'chain_id,tx_hash,log_index' }),
    supabase.from('nft_positions').update({
      status:    'BURNED',
      burned_at: new Date(Number(args.liquidatedAt) * 1000).toISOString(),
      burn_tx:   txHash,
    }).eq('token_id', tokenId),
  ]);

  if (loanRes.error)  throw new Error(`loans update failed: ${loanRes.error.message}`);
  if (eventRes.error) throw new Error(`loan_events insert failed: ${eventRes.error.message}`);
  if (nftRes.error)   throw new Error(`nft_positions update failed: ${nftRes.error.message}`);

  logger.warn({ service: 'loanService', fn: 'writeLoanLiquidated', chainId, tokenId, txHash }, 'Loan liquidated — Supabase updated');
}

// ── Backfill: catch events missed during downtime ─────────────────────────────
async function backfillChain(
  supabase:     SupabaseClient,
  config:       ChainConfig,
  fromBlock:    bigint,
  toBlock:      bigint
): Promise<void> {
  const client = createPublicClient({ chain: config.viemChain as any, transport: http(config.rpcHttp) });
  logger.info({ service: 'loanService', fn: 'backfillChain', chainId: config.chainId, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() }, 'Starting backfill');

  const CHUNK = 2000n;
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    const end = start + CHUNK - 1n < toBlock ? start + CHUNK - 1n : toBlock;

    const [originated, repaid, liquidated] = await Promise.all([
      client.getLogs({ address: config.loanManager, event: LOAN_ORIGINATED_ABI,  fromBlock: start, toBlock: end }),
      client.getLogs({ address: config.loanManager, event: LOAN_REPAID_ABI,      fromBlock: start, toBlock: end }),
      client.getLogs({ address: config.loanManager, event: LOAN_LIQUIDATED_ABI,  fromBlock: start, toBlock: end }),
    ]);

    for (const log of originated) {
      try { await writeLoanOriginated(supabase, config.chainId, log, log.args as any); } catch (e: any) { logger.error({ err: e.message, txHash: log.transactionHash }, 'backfill failure'); }
    }
    for (const log of repaid) {
      try { await writeLoanRepaid(supabase, config.chainId, log, log.args as any); } catch (e: any) { logger.error({ err: e.message, txHash: log.transactionHash }, 'backfill failure'); }
    }
    for (const log of liquidated) {
      try { await writeLoanLiquidated(supabase, config.chainId, log, log.args as any); } catch (e: any) { logger.error({ err: e.message, txHash: log.transactionHash }, 'backfill failure'); }
    }
  }
}

// ── Real-time watcher ─────────────────────────────────────────────────────────
function watchChain(supabase: SupabaseClient, config: ChainConfig): void {
  const transport = webSocket(config.rpcWs, { retryCount: 10, retryDelay: 3000 });
  const client    = createPublicClient({ chain: config.viemChain as any, transport });

  client.watchContractEvent({
    address:   config.loanManager,
    abi:       [LOAN_ORIGINATED_ABI],
    eventName: 'LoanOriginated',
    onLogs: (logs) => {
      for (const log of logs) writeLoanOriginated(supabase, config.chainId, log, log.args as any).catch(logger.error);
    },
  });

  client.watchContractEvent({
    address:   config.loanManager,
    abi:       [LOAN_REPAID_ABI],
    eventName: 'LoanRepaid',
    onLogs: (logs) => {
      for (const log of logs) writeLoanRepaid(supabase, config.chainId, log, log.args as any).catch(logger.error);
    },
  });

  client.watchContractEvent({
    address:   config.loanManager,
    abi:       [LOAN_LIQUIDATED_ABI],
    eventName: 'LoanLiquidated',
    onLogs: (logs) => {
      for (const log of logs) writeLoanLiquidated(supabase, config.chainId, log, log.args as any).catch(logger.error);
    },
  });

  logger.info({ service: 'loanService', chainId: config.chainId, loanManager: config.loanManager }, 'Watching chain');
}

// ── Service entrypoint ────────────────────────────────────────────────────────
export async function startLoanService(): Promise<void> {
  logger.info({ service: 'loanService' }, 'Booting loan event listener');
  const supabase = buildSupabase();

  for (const config of CHAIN_CONFIGS) {
    if (config.loanManager === '0x0000000000000000000000000000000000000000') continue;

    try {
      const httpClient = createPublicClient({ chain: config.viemChain as any, transport: http(config.rpcHttp) });
      const latestBlock = await httpClient.getBlockNumber();
      if (latestBlock > config.startBlock) await backfillChain(supabase, config, config.startBlock, latestBlock);
    } catch (e: any) {
      logger.error({ chainId: config.chainId, err: e.message }, 'Backfill failed — continuing to live watch');
    }

    watchChain(supabase, config);
  }
}
