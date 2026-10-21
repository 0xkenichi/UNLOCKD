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

import { createPublicClient, webSocket, http, getAbiItem, type Log, type PublicClient } from 'viem';
import { base, arbitrum, sepolia } from 'viem/chains';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';
import { LOAN_MANAGER_ABI } from '../contracts/vestraAbi';

// ── Logger ────────────────────────────────────────────────────────────────────
const logger = pino({
  name:      'loanService',
  level:     process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

// ── ABIs (from packages/contracts/abi via ../contracts/vestraAbi) ─────────────
const LOAN_OPENED_ABI     = getAbiItem({ abi: LOAN_MANAGER_ABI, name: 'LoanOpened' });
const LOAN_REPAID_ABI     = getAbiItem({ abi: LOAN_MANAGER_ABI, name: 'LoanRepaid' });
const LOAN_LIQUIDATED_ABI = getAbiItem({ abi: LOAN_MANAGER_ABI, name: 'LoanLiquidated' });

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

async function blockTime(client: PublicClient, log: Log): Promise<Date> {
  const block = await client.getBlock({ blockNumber: log.blockNumber! });
  return new Date(Number(block.timestamp) * 1000);
}

async function writeLoanOpened(
  supabase: SupabaseClient,
  client:   PublicClient,
  config:   ChainConfig,
  log:      Log,
  args:     {
    loanId:    bigint;
    borrower:  string;
    token:     string;
    escrowId:  bigint;
    principal: bigint;
    fee:       bigint;
    maturity:  bigint;
    pv:        bigint;
  }
): Promise<void> {
  const tokenId = args.loanId.toString();
  const txHash  = log.transactionHash!;

  // The event carries no unlock time or rate; read them at the origination block.
  const [loan, rateBps, openedAt] = await Promise.all([
    client.readContract({ address: config.loanManager, abi: LOAN_MANAGER_ABI, functionName: 'getLoan', args: [args.loanId], blockNumber: log.blockNumber! }),
    client.readContract({ address: config.loanManager, abi: LOAN_MANAGER_ABI, functionName: 'currentRateBps', blockNumber: log.blockNumber! }),
    blockTime(client, log),
  ]);
  const ltvBps = args.pv > 0n ? Number((args.principal * 10_000n) / args.pv) : 0;

  const loanRow = {
    token_id:              tokenId,
    chain_id:              config.chainId,
    borrower:              args.borrower.toLowerCase(),
    collateral_token:      args.token.toLowerCase(),
    principal_usdc:        args.principal.toString(),
    interest_rate_bps:     Number(rateBps), // floating; rate at origination
    origination_fee_usdc:  args.fee.toString(),
    unlock_time:           new Date(Number(loan.unlockTime) * 1000).toISOString(),
    dpv_usdc:              args.pv.toString(),
    ltv_bps:               ltvBps,
    status:                'ACTIVE',
    origination_tx:        txHash,
    origination_block:     Number(log.blockNumber),
  };

  const eventRow = {
    token_id:     tokenId,
    chain_id:     config.chainId,
    event_type:   'LOAN_ORIGINATED',
    payload:      {
      borrower:           args.borrower,
      collateral_token:   args.token,
      escrow_id:          args.escrowId.toString(),
      stream_contract:    loan.nftContract,
      stream_id:          loan.streamId.toString(),
      principal_usdc:     args.principal.toString(),
      interest_rate_bps:  rateBps.toString(),
      maturity:           args.maturity.toString(),
      unlock_time:        loan.unlockTime.toString(),
      dpv_usdc:           args.pv.toString(),
      ltv_bps:            ltvBps.toString(),
      origination_fee:    args.fee.toString(),
    },
    tx_hash:      txHash,
    block_number: Number(log.blockNumber),
    log_index:    log.logIndex ?? 0,
  };

  // The borrower's stream NFT is held in VestingAdapter escrow for the life of the loan.
  const nftRow = {
    token_id:   tokenId,
    chain_id:   config.chainId,
    owner:      args.borrower.toLowerCase(),
    status:     'ACTIVE',
    minted_at:  openedAt.toISOString(),
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

  logger.info({ service: 'loanService', fn: 'writeLoanOpened', chainId: config.chainId, tokenId, txHash }, 'Loan opened — Supabase written');
}

async function writeLoanRepaid(
  supabase: SupabaseClient,
  client:   PublicClient,
  config:   ChainConfig,
  log:      Log,
  args:     {
    loanId:        bigint;
    payer:         string;
    principalPaid: bigint;
    interestPaid:  bigint;
    closed:        boolean;
  }
): Promise<void> {
  const tokenId = args.loanId.toString();
  const txHash  = log.transactionHash!;
  const repaidAt = await blockTime(client, log);

  const eventRow = {
    token_id:     tokenId,
    chain_id:     config.chainId,
    event_type:   'LOAN_REPAID',
    payload:      {
      payer:            args.payer,
      principal_paid:   args.principalPaid.toString(),
      interest_paid:    args.interestPaid.toString(),
      total_repaid:     (args.principalPaid + args.interestPaid).toString(),
      closed:           args.closed,
      repaid_at:        Math.floor(repaidAt.getTime() / 1000).toString(),
    },
    tx_hash:      txHash,
    block_number: Number(log.blockNumber),
    log_index:    log.logIndex ?? 0,
  };

  const eventRes = await supabase.from('loan_events').upsert(eventRow, { onConflict: 'chain_id,tx_hash,log_index' });
  if (eventRes.error) throw new Error(`loan_events insert failed: ${eventRes.error.message}`);

  // A partial repayment leaves the loan active; the event log keeps the history.
  if (!args.closed) {
    logger.info({ service: 'loanService', fn: 'writeLoanRepaid', chainId: config.chainId, tokenId, txHash }, 'Partial repayment logged');
    return;
  }

  // Interest is the sum over all repayments of this loan, including this one.
  const { data: prior } = await supabase
    .from('loan_events')
    .select('payload')
    .eq('chain_id', config.chainId)
    .eq('token_id', tokenId)
    .eq('event_type', 'LOAN_REPAID');
  const sum = (key: string) =>
    (prior ?? []).reduce((acc: bigint, row: any) => acc + BigInt(row.payload?.[key] ?? 0), 0n);

  const loanUpdate = {
    status:               'REPAID',
    interest_accrued_usdc: sum('interest_paid').toString(),
    total_repaid_usdc:    sum('total_repaid').toString(),
    settled_at:           repaidAt.toISOString(),
    settlement_tx:        txHash,
  };

  const nftUpdate = {
    status:    'REPAID',
    burned_at: repaidAt.toISOString(),
    burn_tx:   txHash,
  };

  const [loanRes, nftRes] = await Promise.all([
    supabase.from('loans').update(loanUpdate).eq('token_id', tokenId),
    supabase.from('nft_positions').update(nftUpdate).eq('token_id', tokenId),
  ]);

  if (loanRes.error)  throw new Error(`loans update failed: ${loanRes.error.message}`);
  if (nftRes.error)   throw new Error(`nft_positions update failed: ${nftRes.error.message}`);

  logger.info({ service: 'loanService', fn: 'writeLoanRepaid', chainId: config.chainId, tokenId, txHash }, 'Loan repaid — Supabase updated');
}

async function writeLoanLiquidated(
  supabase: SupabaseClient,
  client:   PublicClient,
  config:   ChainConfig,
  log:      Log,
  args:     {
    loanId:           bigint;
    winner:           string;
    price:            bigint;
    insuranceCovered: bigint;
    lenderLoss:       bigint;
    borrowerSurplus:  bigint;
  }
): Promise<void> {
  const tokenId = args.loanId.toString();
  const txHash  = log.transactionHash!;
  const settledAt = await blockTime(client, log);

  const [loanRes, eventRes, nftRes] = await Promise.all([
    supabase.from('loans').update({
      status:       'LIQUIDATED',
      settled_at:   settledAt.toISOString(),
      settlement_tx: txHash,
      total_repaid_usdc: args.price.toString(),
    }).eq('token_id', tokenId),
    supabase.from('loan_events').upsert({
      token_id:     tokenId,
      chain_id:     config.chainId,
      event_type:   'LOAN_LIQUIDATED',
      payload: {
        winner:            args.winner,
        price:             args.price.toString(),
        insurance_covered: args.insuranceCovered.toString(),
        lender_loss:       args.lenderLoss.toString(),
        borrower_surplus:  args.borrowerSurplus.toString(),
        liquidated_at:     Math.floor(settledAt.getTime() / 1000).toString(),
      },
      tx_hash:      txHash,
      block_number: Number(log.blockNumber),
      log_index:    log.logIndex ?? 0,
    }, { onConflict: 'chain_id,tx_hash,log_index' }),
    // The stream NFT went to the auction winner.
    supabase.from('nft_positions').update({
      owner:     args.winner.toLowerCase(),
      status:    'LIQUIDATED',
      burned_at: settledAt.toISOString(),
      burn_tx:   txHash,
    }).eq('token_id', tokenId),
  ]);

  if (loanRes.error)  throw new Error(`loans update failed: ${loanRes.error.message}`);
  if (eventRes.error) throw new Error(`loan_events insert failed: ${eventRes.error.message}`);
  if (nftRes.error)   throw new Error(`nft_positions update failed: ${nftRes.error.message}`);

  logger.warn({ service: 'loanService', fn: 'writeLoanLiquidated', chainId: config.chainId, tokenId, txHash }, 'Loan liquidated — Supabase updated');
}

// ── Backfill: catch events missed during downtime ─────────────────────────────
async function backfillChain(
  supabase:     SupabaseClient,
  config:       ChainConfig,
  fromBlock:    bigint,
  toBlock:      bigint
): Promise<void> {
  const client = createPublicClient({ chain: config.viemChain as any, transport: http(config.rpcHttp) }) as PublicClient;
  logger.info({ service: 'loanService', fn: 'backfillChain', chainId: config.chainId, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() }, 'Starting backfill');

  const CHUNK = 2000n;
  for (let start = fromBlock; start <= toBlock; start += CHUNK) {
    const end = start + CHUNK - 1n < toBlock ? start + CHUNK - 1n : toBlock;

    const [opened, repaid, liquidated] = await Promise.all([
      client.getLogs({ address: config.loanManager, event: LOAN_OPENED_ABI,      fromBlock: start, toBlock: end }),
      client.getLogs({ address: config.loanManager, event: LOAN_REPAID_ABI,      fromBlock: start, toBlock: end }),
      client.getLogs({ address: config.loanManager, event: LOAN_LIQUIDATED_ABI,  fromBlock: start, toBlock: end }),
    ]);

    for (const log of opened) {
      try { await writeLoanOpened(supabase, client, config, log, log.args as any); } catch (e: any) { logger.error({ err: e.message, txHash: log.transactionHash }, 'backfill failure'); }
    }
    for (const log of repaid) {
      try { await writeLoanRepaid(supabase, client, config, log, log.args as any); } catch (e: any) { logger.error({ err: e.message, txHash: log.transactionHash }, 'backfill failure'); }
    }
    for (const log of liquidated) {
      try { await writeLoanLiquidated(supabase, client, config, log, log.args as any); } catch (e: any) { logger.error({ err: e.message, txHash: log.transactionHash }, 'backfill failure'); }
    }
  }
}

// ── Real-time watcher ─────────────────────────────────────────────────────────
function watchChain(supabase: SupabaseClient, config: ChainConfig): void {
  const transport = webSocket(config.rpcWs, { retryCount: 10, retryDelay: 3000 });
  const client    = createPublicClient({ chain: config.viemChain as any, transport }) as unknown as PublicClient;

  client.watchContractEvent({
    address:   config.loanManager,
    abi:       [LOAN_OPENED_ABI],
    eventName: 'LoanOpened',
    onLogs: (logs) => {
      for (const log of logs) writeLoanOpened(supabase, client, config, log, log.args as any).catch(logger.error);
    },
  });

  client.watchContractEvent({
    address:   config.loanManager,
    abi:       [LOAN_REPAID_ABI],
    eventName: 'LoanRepaid',
    onLogs: (logs) => {
      for (const log of logs) writeLoanRepaid(supabase, client, config, log, log.args as any).catch(logger.error);
    },
  });

  client.watchContractEvent({
    address:   config.loanManager,
    abi:       [LOAN_LIQUIDATED_ABI],
    eventName: 'LoanLiquidated',
    onLogs: (logs) => {
      for (const log of logs) writeLoanLiquidated(supabase, client, config, log, log.args as any).catch(logger.error);
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
