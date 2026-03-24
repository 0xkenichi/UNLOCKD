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
      const data = await resp.json() as Record<string, { [key: string]: number }>;
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
