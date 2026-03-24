# Vestra Protocol — Backend Services & Data Layer
## Testnet Build Package v1.0
> Stack: Node.js 20 + TypeScript 5 (strict) | Supabase | Redis | BullMQ

---

## §1 — Supabase Schema (Complete SQL Migration)

```sql
-- =============================================================================
-- Vestra Protocol — Supabase Migration 001
-- Run: supabase db push
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── users ───────────────────────────────────────────────────────────────────
-- Central account index. One row per human (wallet = primary identifier).
create table public.users (
  id              uuid primary key default uuid_generate_v4(),
  primary_wallet  text not null unique,    -- EVM or Solana address (checksum)
  chain_type      text not null default 'evm', -- 'evm' | 'solana'
  created_at      timestamptz not null default now(),
  last_login      timestamptz,
  genesis_flag    boolean not null default false -- true = TITAN HNW flag
);

create index idx_users_wallet on public.users(primary_wallet);

-- ─── identity_profiles ───────────────────────────────────────────────────────
-- VCS score cache. Background cron refreshes every 72h.
create table public.identity_profiles (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references public.users(id) on delete cascade,
  vcs_score             integer not null default 500 check (vcs_score between 0 and 1000),
  tier                  text not null default 'STANDARD'
                          check (tier in ('RECRUIT','SCOUT','STANDARD','PREMIUM','TITAN')),
  max_credit_limit_bps  integer not null default 4000  -- BPS: 10000 = 100%
                          check (max_credit_limit_bps between 1000 and 6500),
  gitcoin_score         numeric(8,4),         -- raw Gitcoin Passport score (0–100)
  has_world_id          boolean default false,
  eas_attestation_count integer default 0,
  tx_count              integer default 0,
  balance_usd           numeric(20,4) default 0,
  total_repaid_loans    integer default 0,
  has_defaults          boolean default false,
  last_sync             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  unique(user_id)
);

create index idx_identity_user on public.identity_profiles(user_id);
create index idx_identity_tier on public.identity_profiles(tier);
create index idx_identity_last_sync on public.identity_profiles(last_sync);

-- ─── collateral_history ──────────────────────────────────────────────────────
-- Token price history for baseline pricing. Written by PriceHistoryCache cron.
-- One row per token per chain. Updated every 5 minutes.
create table public.collateral_history (
  id                       uuid primary key default uuid_generate_v4(),
  token_address            text not null,
  chain_id                 integer not null,
  token_symbol             text,
  spot_price               numeric(30,18),          -- current spot (USD)
  seven_day_low            numeric(30,18),           -- lowest price in 7d window
  thirty_day_low           numeric(30,18),           -- lowest price in 30d window
  historical_baseline_price numeric(30,18),          -- = weighted 30d low (see formula)
  volatility_30d           numeric(8,6),             -- realized vol (0.0–1.0)
  last_updated_at          timestamptz not null default now(),
  unique(token_address, chain_id)
);

create index idx_collateral_token on public.collateral_history(token_address, chain_id);

-- ─── loans ───────────────────────────────────────────────────────────────────
-- Off-chain mirror of on-chain loan state. Written by LoanManager event listener.
create table public.loans (
  id               uuid primary key default uuid_generate_v4(),
  loan_id_onchain  integer not null unique, -- matches LoanManager.nextLoanId
  chain_id         integer not null,
  borrower_wallet  text not null,
  stream_contract  text not null,
  stream_id        integer not null,
  collateral_token text not null,
  borrowed_usdc    numeric(20,6) not null,
  dpv_at_origin    numeric(30,18),
  interest_rate_bps integer not null,
  nft_token_id     integer,
  originated_at    timestamptz not null,
  due_at           timestamptz not null,
  status           text not null default 'active'
                     check (status in ('active','repaid','settled','defaulted')),
  repaid_at        timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_loans_borrower on public.loans(borrower_wallet);
create index idx_loans_status   on public.loans(status);

-- ─── vcs_sync_queue ──────────────────────────────────────────────────────────
-- Tracks which wallets need VCS re-evaluation. Cron reads and processes this.
create table public.vcs_sync_queue (
  id          uuid primary key default uuid_generate_v4(),
  wallet      text not null unique,
  priority    integer default 5,   -- 1 = urgent (new loan), 5 = routine
  queued_at   timestamptz not null default now(),
  processed_at timestamptz
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.users               enable row level security;
alter table public.identity_profiles   enable row level security;
alter table public.collateral_history  enable row level security;
alter table public.loans               enable row level security;

-- Public read on collateral_history (anyone can see token pricing)
create policy "collateral_history_public_read"
  on public.collateral_history for select using (true);

-- Users can only read their own profile
create policy "identity_profiles_owner_read"
  on public.identity_profiles for select
  using (user_id = (
    select id from public.users where primary_wallet = auth.jwt()->>'sub'
  ));

-- Service role (backend) has full access via service_key
-- (no RLS restriction for service_role — this is the default in Supabase)
```

---

## §2 — PriceHistoryCache.ts
> Writes 30d price candles to Redis + Supabase `collateral_history`.
> Computes the `historical_baseline_price` used for safe LTV calculation.

```typescript
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'PriceHistoryCache' });

// ─── Config ──────────────────────────────────────────────────────────────────
const MAX_CANDLES    = 90;   // 90 days of 5-min candles
const REFRESH_MS     = 5 * 60 * 1000; // 5 minutes
const BASELINE_ALPHA = 0.7;  // Weight towards 30d low (conservative)
const CHAIN_IDS      = [11155111, 84532]; // Sepolia, Base Sepolia

const TRACKED_TOKENS: Record<string, { chainId: number; coingeckoId: string }> = {
  // Testnet mock tokens don't have CoinGecko IDs; use mainnet equivalents for
  // price simulation (this is testnet — we use real mainnet price feeds
  // for the underlying asset, but apply them to our mock token contracts)
  '0xmLDO_SEPOLIA':  { chainId: 11155111, coingeckoId: 'lido-dao' },
  '0xmAGIX_SEPOLIA': { chainId: 11155111, coingeckoId: 'singularitynet' },
  // Add Base Sepolia addresses after deploy
};

export interface PriceSample {
  timestamp: number;   // Unix seconds
  priceUsd:  number;   // USD price
}

// ─── Baseline Price Formula ───────────────────────────────────────────────────
/**
 * Computes the historical_baseline_price used for safe LTV.
 *
 * Formula:
 *   baseline = spot × (1 - alpha) + thirtyDayLow × alpha
 *
 * This means: if alpha = 0.7, the baseline is heavily weighted toward the
 * 30-day low price, not the current spot. A token currently at $2.00
 * that hit $0.80 over 30 days gets a baseline of:
 *   2.00 × 0.3 + 0.80 × 0.7 = $0.60 + $0.56 = $1.16
 *
 * This directly implements the whitepaper's "Historical Fluctuation Algorithm".
 */
export function computeBaseline(
  spotPrice:     number,
  thirtyDayLow:  number,
  alpha = BASELINE_ALPHA
): number {
  return spotPrice * (1 - alpha) + thirtyDayLow * alpha;
}

// ─── Service ─────────────────────────────────────────────────────────────────
export class PriceHistoryCache {
  private redis:    Redis;
  private supabase: ReturnType<typeof createClient>;
  private timer:    NodeJS.Timeout | null = null;

  constructor(redisUrl: string, supabaseUrl: string, supabaseServiceKey: string) {
    this.redis    = new Redis(redisUrl, { lazyConnect: true });
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  async start(): Promise<void> {
    await this.redis.connect();
    logger.info('PriceHistoryCache started');

    // Backfill on startup if cache is cold
    await this.backfillIfNeeded();

    // Schedule recurring refresh
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
    await this.refresh(); // immediate first run
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.redis.quit();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async getBaseline(tokenAddress: string, chainId: number): Promise<number | null> {
    const { data, error } = await this.supabase
      .from('collateral_history')
      .select('historical_baseline_price')
      .eq('token_address', tokenAddress.toLowerCase())
      .eq('chain_id', chainId)
      .single();

    if (error || !data) {
      logger.warn({ tokenAddress, chainId }, 'No baseline found in Supabase');
      return null;
    }
    return parseFloat(data.historical_baseline_price);
  }

  async getCandles(tokenAddress: string, chainId: number): Promise<PriceSample[]> {
    const key  = this.redisKey(tokenAddress, chainId);
    const raw  = await this.redis.lrange(key, 0, -1).catch(() => [] as string[]);
    return raw.map(r => JSON.parse(r) as PriceSample);
  }

  // ─── Core Refresh ──────────────────────────────────────────────────────────

  private async refresh(): Promise<void> {
    for (const [address, cfg] of Object.entries(TRACKED_TOKENS)) {
      try {
        await this.refreshToken(address, cfg.chainId, cfg.coingeckoId);
      } catch (err: any) {
        logger.error({ err: err.message, address }, 'PriceHistoryCache refresh failed');
      }
    }
  }

  private async refreshToken(
    tokenAddress: string,
    chainId:      number,
    coingeckoId:  string
  ): Promise<void> {
    // 1. Fetch current price from CoinGecko (free tier)
    const priceUsd = await this.fetchCoinGeckoPrice(coingeckoId);
    if (priceUsd === null) {
      logger.warn({ tokenAddress, coingeckoId }, 'CoinGecko returned null price');
      return;
    }

    // 2. Append to Redis candle list
    const sample: PriceSample = { timestamp: Math.floor(Date.now() / 1000), priceUsd };
    const key = this.redisKey(tokenAddress, chainId);

    await this.redis
      .pipeline()
      .rpush(key, JSON.stringify(sample))
      .ltrim(key, -MAX_CANDLES, -1) // keep last 90 candles
      .exec();

    // Publish price update event for dDPV workers
    await this.redis.publish('vestra:price-updated', JSON.stringify({
      tokenAddress,
      chainId,
      priceUsd,
      timestamp: sample.timestamp,
    }));

    // 3. Compute 7d low, 30d low, baseline
    const candles = await this.getCandles(tokenAddress, chainId);
    const now      = sample.timestamp;
    const sevenDayCandles  = candles.filter(c => c.timestamp >= now - 7  * 86400);
    const thirtyDayCandles = candles.filter(c => c.timestamp >= now - 30 * 86400);

    const sevenDayLow  = sevenDayCandles.length
      ? Math.min(...sevenDayCandles.map(c => c.priceUsd))
      : priceUsd;
    const thirtyDayLow = thirtyDayCandles.length
      ? Math.min(...thirtyDayCandles.map(c => c.priceUsd))
      : priceUsd;

    const baseline = computeBaseline(priceUsd, thirtyDayLow);
    const vol30d   = this.computeVolatility(thirtyDayCandles);

    // 4. Upsert to Supabase collateral_history
    const { error } = await this.supabase
      .from('collateral_history')
      .upsert({
        token_address:             tokenAddress.toLowerCase(),
        chain_id:                  chainId,
        spot_price:                priceUsd,
        seven_day_low:             sevenDayLow,
        thirty_day_low:            thirtyDayLow,
        historical_baseline_price: baseline,
        volatility_30d:            vol30d,
        last_updated_at:           new Date().toISOString(),
      }, {
        onConflict: 'token_address,chain_id',
      });

    if (error) {
      logger.error({ error, tokenAddress }, 'Supabase upsert failed');
      throw error;
    }

    logger.info({
      service:   'PriceHistoryCache',
      fn:        'refreshToken',
      tokenAddress,
      chainId,
      priceUsd,
      thirtyDayLow,
      baseline,
      vol30d,
    }, 'Price candle updated');
  }

  // ─── Backfill ──────────────────────────────────────────────────────────────

  private async backfillIfNeeded(): Promise<void> {
    for (const [address, cfg] of Object.entries(TRACKED_TOKENS)) {
      const key  = this.redisKey(address, cfg.chainId);
      const len  = await this.redis.llen(key).catch(() => 0);

      if (len >= 7) {
        logger.info({ address }, 'Cache warm, skipping backfill');
        continue;
      }

      logger.info({ address, len }, 'Cold cache — running backfill');
      try {
        await this.backfillFromCoinGecko(address, cfg.chainId, cfg.coingeckoId);
      } catch (err: any) {
        logger.warn({ err: err.message, address }, 'Backfill failed — will fill over time');
      }
    }
  }

  private async backfillFromCoinGecko(
    tokenAddress: string,
    chainId:      number,
    coingeckoId:  string
  ): Promise<void> {
    // CoinGecko /market_chart endpoint: 30 days of hourly prices
    const url  = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=30&interval=hourly`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!resp.ok) throw new Error(`CoinGecko backfill HTTP ${resp.status}`);
    const data = await resp.json() as { prices: [number, number][] };

    const key = this.redisKey(tokenAddress, chainId);
    const pipe = this.redis.pipeline();

    for (const [tsMs, price] of data.prices) {
      const sample: PriceSample = { timestamp: Math.floor(tsMs / 1000), priceUsd: price };
      pipe.rpush(key, JSON.stringify(sample));
    }
    pipe.ltrim(key, -MAX_CANDLES, -1);
    await pipe.exec();

    logger.info({ tokenAddress, count: data.prices.length }, 'Backfill complete');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async fetchCoinGeckoPrice(coingeckoId: string): Promise<number | null> {
    try {
      const url  = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as Record<string, { usd: number }>;
      return data[coingeckoId]?.usd ?? null;
    } catch (err: any) {
      logger.error({ err: err.message, coingeckoId }, 'CoinGecko fetch failed');
      return null;
    }
  }

  private computeVolatility(candles: PriceSample[]): number {
    if (candles.length < 2) return 0;
    const prices  = candles.map(c => c.priceUsd);
    const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
    const mean    = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance * 365); // annualized volatility
  }

  private redisKey(tokenAddress: string, chainId: number): string {
    return `prices:${chainId}:${tokenAddress.toLowerCase()}`;
  }
}
```

---

## §3 — VCS Sync Service
> Reads identity data, computes VCS, writes to Supabase, pushes tier to LoanManager on-chain.

```typescript
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import pino from 'pino';
import { calculateIdentityCreditScore } from './identityCreditScore.js';

const logger = pino({ name: 'VcsSyncService' });

// LoanManager ABI (just the function we need)
const LOAN_MANAGER_ABI = [
  {
    name: 'setVcsTier',
    type: 'function',
    inputs: [
      { name: 'borrower',   type: 'address' },
      { name: 'tier',       type: 'uint256' },
      { name: 'creditBps_', type: 'uint256' },
    ],
  },
] as const;

const TIER_MAP: Record<string, number> = {
  RECRUIT:  0,
  SCOUT:    0,
  STANDARD: 0,
  PREMIUM:  1,
  TITAN:    2,
};

export class VcsSyncService {
  private supabase:   ReturnType<typeof createClient>;
  private viemClient: ReturnType<typeof createPublicClient>;
  private wallet:     ReturnType<typeof createWalletClient>;
  private loanManagerAddress: `0x${string}`;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    rpcUrl:      string,
    relayerKey:  string,
    loanManager: string,
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.viemClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    this.wallet   = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
    this.loanManagerAddress = loanManager as `0x${string}`;
  }

  /**
   * Run the VCS sync for a single wallet.
   * Called by: cron job (every 72h) OR triggered immediately when a wallet
   * initiates a first borrow (priority=1 from vcs_sync_queue).
   */
  async syncWallet(wallet: string): Promise<void> {
    logger.info({ fn: 'syncWallet', wallet }, 'Starting VCS sync');

    try {
      // 1. Gather identity signals
      const signals = await this.gatherSignals(wallet);

      // 2. Compute VCS score
      const result = calculateIdentityCreditScore(signals);
      const { score, tier, riskMultiplier } = result;

      // 3. Map tier to maxCreditBps
      const maxCreditBps = this.tierToMaxCredit(tier, score);

      // 4. Write to Supabase (upsert identity_profiles)
      const { data: user } = await this.supabase
        .from('users')
        .select('id')
        .eq('primary_wallet', wallet.toLowerCase())
        .single();

      if (!user) {
        // Auto-create user on first sync
        const { data: newUser } = await this.supabase
          .from('users')
          .insert({ primary_wallet: wallet.toLowerCase() })
          .select('id')
          .single();

        if (!newUser) throw new Error('Failed to create user record');
      }

      const userId = user?.id;

      await this.supabase.from('identity_profiles').upsert({
        user_id:              userId,
        vcs_score:            score,
        tier,
        max_credit_limit_bps: maxCreditBps,
        ...signals,
        last_sync:            new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // 5. Push tier on-chain to LoanManager (RELAYER_ROLE required)
      await this.pushTierOnChain(wallet, tier, maxCreditBps);

      // 6. Flag Titan wallets for manual onboarding
      if (tier === 'TITAN') {
        await this.supabase
          .from('users')
          .update({ genesis_flag: true })
          .eq('primary_wallet', wallet.toLowerCase());

        logger.warn({ wallet, score }, 'TITAN tier flagged — Genesis onboarding required');
      }

      logger.info({ fn: 'syncWallet', wallet, score, tier, maxCreditBps }, 'VCS sync complete');

    } catch (err: any) {
      logger.error({ err: err.message, wallet }, 'VCS sync failed');
      throw err;
    }
  }

  /**
   * Process the vcs_sync_queue. Called by a cron every 30 minutes.
   * Processes up to 50 wallets per run, priority-ordered.
   */
  async processSyncQueue(): Promise<void> {
    const { data: queue, error } = await this.supabase
      .from('vcs_sync_queue')
      .select('*')
      .is('processed_at', null)
      .order('priority', { ascending: true })
      .order('queued_at',  { ascending: true })
      .limit(50);

    if (error || !queue?.length) return;

    for (const item of queue) {
      try {
        await this.syncWallet(item.wallet);
        await this.supabase
          .from('vcs_sync_queue')
          .update({ processed_at: new Date().toISOString() })
          .eq('id', item.id);
      } catch {
        // Log already happened in syncWallet — continue to next
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async gatherSignals(wallet: string): Promise<Record<string, any>> {
    // On testnet: fetch from available APIs. On mainnet: add Gitcoin + World ID.
    const [txCount, gitcoinScore, hasWorldId] = await Promise.allSettled([
      this.fetchTxCount(wallet),
      this.fetchGitcoinScore(wallet),
      this.fetchWorldId(wallet),
    ]);

    return {
      gitcoin_passport_score: gitcoinScore.status === 'fulfilled' ? gitcoinScore.value : 0,
      has_world_id:           hasWorldId.status  === 'fulfilled' ? hasWorldId.value   : false,
      attestations:           [],  // EAS integration: v2
      tx_count:               txCount.status === 'fulfilled' ? txCount.value : 0,
      balance_usd:            '0', // Zerion/Alchemy balance API: v2
      total_repaid_loans:     await this.fetchRepaidLoans(wallet),
      has_defaults:           await this.fetchHasDefaults(wallet),
    };
  }

  private async fetchTxCount(wallet: string): Promise<number> {
    const count = await this.viemClient.getTransactionCount({ address: wallet as `0x${string}` });
    return count;
  }

  private async fetchGitcoinScore(wallet: string): Promise<number> {
    try {
      const resp = await fetch(
        `https://api.passport.gitcoin.co/registry/score/${wallet}`,
        {
          headers: { 'X-API-KEY': process.env.GITCOIN_API_KEY || '' },
          signal:  AbortSignal.timeout(5_000),
        }
      );
      if (!resp.ok) return 0;
      const data = await resp.json() as { score: string };
      return parseFloat(data.score || '0');
    } catch {
      return 0; // Graceful degradation — score contribution zeroed
    }
  }

  private async fetchWorldId(wallet: string): Promise<boolean> {
    // World ID verification: check EAS attestation schema on Sepolia
    // Schema: world-id-v2 (placeholder — wire real EAS query here)
    return false; // testnet: World ID not required
  }

  private async fetchRepaidLoans(wallet: string): Promise<number> {
    const { count } = await this.supabase
      .from('loans')
      .select('id', { count: 'exact', head: true })
      .eq('borrower_wallet', wallet.toLowerCase())
      .eq('status', 'repaid');
    return count ?? 0;
  }

  private async fetchHasDefaults(wallet: string): Promise<boolean> {
    const { count } = await this.supabase
      .from('loans')
      .select('id', { count: 'exact', head: true })
      .eq('borrower_wallet', wallet.toLowerCase())
      .eq('status', 'defaulted');
    return (count ?? 0) > 0;
  }

  private tierToMaxCredit(tier: string, score: number): number {
    if (tier === 'TITAN')   return 6500;
    if (tier === 'PREMIUM') return 5000;
    if (score >= 500)       return 4000; // STANDARD
    if (score >= 300)       return 2000; // SCOUT
    return 1000;                         // RECRUIT
  }

  private async pushTierOnChain(wallet: string, tier: string, maxCreditBps: number): Promise<void> {
    const onChainTier = TIER_MAP[tier] ?? 0;
    try {
      const hash = await this.wallet.writeContract({
        address: this.loanManagerAddress,
        abi:     LOAN_MANAGER_ABI,
        functionName: 'setVcsTier',
        args:    [wallet as `0x${string}`, BigInt(onChainTier), BigInt(maxCreditBps)],
      });
      logger.info({ fn: 'pushTierOnChain', wallet, tier, hash }, 'VCS tier pushed on-chain');
    } catch (err: any) {
      // Non-fatal: on-chain push can be retried. Supabase is source of truth for now.
      logger.error({ err: err.message, wallet }, 'On-chain VCS push failed');
    }
  }
}
```

---

## §4 — On-Chain Event Listener
> Listens to LoanManager events and mirrors state to Supabase `loans` table.

```typescript
import { createPublicClient, http, parseAbiItem } from 'viem';
import { sepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';

const logger = pino({ name: 'EventListener' });

const LOAN_EVENTS = [
  parseAbiItem('event LoanOriginated(uint256 indexed loanId, address indexed borrower, uint256 streamId, uint256 borrowedUsdc, uint256 dpvAtOrigination, uint256 nftTokenId)'),
  parseAbiItem('event LoanRepaid(uint256 indexed loanId, address indexed repayer, uint256 principal, uint256 interest)'),
  parseAbiItem('event LoanSettled(uint256 indexed loanId, address indexed borrower, uint256 recoveredUsdc, bool fullRecovery)'),
] as const;

export class LoanEventListener {
  private client:   ReturnType<typeof createPublicClient>;
  private supabase: ReturnType<typeof createClient>;
  private loanManager: `0x${string}`;

  constructor(rpcUrl: string, supabaseUrl: string, supabaseKey: string, loanManager: string) {
    this.client      = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    this.supabase    = createClient(supabaseUrl, supabaseKey);
    this.loanManager = loanManager as `0x${string}`;
  }

  start(): void {
    logger.info('LoanEventListener started');

    // Watch LoanOriginated
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     [LOAN_EVENTS[0]],
      eventName: 'LoanOriginated',
      onLogs: async (logs) => {
        for (const log of logs) {
          const { loanId, borrower, streamId, borrowedUsdc, dpvAtOrigination, nftTokenId } = log.args;
          await this.supabase.from('loans').upsert({
            loan_id_onchain:  Number(loanId),
            chain_id:         11155111,
            borrower_wallet:  borrower!.toLowerCase(),
            stream_contract:  '',       // pull from tx data if needed
            stream_id:        Number(streamId),
            collateral_token: '',
            borrowed_usdc:    Number(borrowedUsdc!) / 1e6,
            dpv_at_origin:    (Number(dpvAtOrigination!) / 1e18).toString(),
            interest_rate_bps: 0,       // pull from contract read
            nft_token_id:     Number(nftTokenId),
            originated_at:    new Date().toISOString(),
            due_at:           new Date().toISOString(), // read from contract
            status:           'active',
          }, { onConflict: 'loan_id_onchain' });
          logger.info({ loanId: loanId?.toString(), borrower }, 'Loan originated synced');
        }
      },
    });

    // Watch LoanRepaid
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     [LOAN_EVENTS[1]],
      eventName: 'LoanRepaid',
      onLogs: async (logs) => {
        for (const log of logs) {
          const { loanId } = log.args;
          await this.supabase.from('loans')
            .update({ status: 'repaid', repaid_at: new Date().toISOString() })
            .eq('loan_id_onchain', Number(loanId));
          logger.info({ loanId: loanId?.toString() }, 'Loan repaid synced');
        }
      },
    });

    // Watch LoanSettled
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     [LOAN_EVENTS[2]],
      eventName: 'LoanSettled',
      onLogs: async (logs) => {
        for (const log of logs) {
          const { loanId } = log.args;
          await this.supabase.from('loans')
            .update({ status: 'settled', repaid_at: new Date().toISOString() })
            .eq('loan_id_onchain', Number(loanId));
          logger.info({ loanId: loanId?.toString() }, 'Loan settled synced');
        }
      },
    });
  }
}
```

---

## §5 — Environment Variables (.env)

```bash
# ─── Blockchain ──────────────────────────────────────────────────────────────
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
DEPLOYER_PRIVATE_KEY=0x...      # Deployer wallet (funded with Sepolia ETH)
RELAYER_PRIVATE_KEY=0x...       # RELAYER_ROLE wallet (separate from deployer)

# ─── Contract Addresses (populated after deploy) ──────────────────────────────
VALUATION_ENGINE_ADDRESS=0x...
LENDING_POOL_ADDRESS=0x...
WRAPPER_NFT_ADDRESS=0x...
LOAN_MANAGER_ADDRESS=0x...
MOCK_SABLIER_ADDRESS=0x...
MOCK_USDC_ADDRESS=0x...
MOCK_LDO_ADDRESS=0x...
MOCK_AGIX_ADDRESS=0x...
INSURANCE_FUND_ADDRESS=0x...    # Multisig or EOA for testnet

# ─── Test wallets ─────────────────────────────────────────────────────────────
TEST_WALLET_1=0x...
TEST_WALLET_2=0x...

# ─── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...   # service_role key (backend only)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...      # anon key (frontend)

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── External APIs ────────────────────────────────────────────────────────────
GITCOIN_API_KEY=your_gitcoin_key
ETHERSCAN_API_KEY=your_etherscan_key

# ─── Protocol ────────────────────────────────────────────────────────────────
MAX_STALENESS_SECONDS=14400     # 4 hours oracle staleness limit
```

---

## §6 — Docker Compose (Full Testnet Stack)

```yaml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis-data:/data"]
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  backend:
    build: ./packages/backend
    depends_on:
      redis:
        condition: service_healthy
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    ports: ["3001:3001"]
    command: npm run start:services

  price-cache:
    build: ./packages/backend
    depends_on:
      redis:
        condition: service_healthy
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    command: npm run start:price-cache

  event-listener:
    build: ./packages/backend
    depends_on:
      redis:
        condition: service_healthy
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    command: npm run start:events

  vcs-cron:
    build: ./packages/backend
    depends_on:
      redis:
        condition: service_healthy
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    command: npm run start:vcs-cron

volumes:
  redis-data:
```

---

## §7 — package.json scripts (backend)

```json
{
  "scripts": {
    "start:services":    "tsx src/index.ts",
    "start:price-cache": "tsx src/services/runPriceCache.ts",
    "start:events":      "tsx src/services/runEventListener.ts",
    "start:vcs-cron":    "tsx src/services/runVcsCron.ts",
    "test":              "vitest run",
    "test:watch":        "vitest",
    "build":             "tsc -p tsconfig.json"
  }
}
```
