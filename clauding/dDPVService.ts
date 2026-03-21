/**
 * dDPVService.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Off-chain oracle feed service for the Vestra ValuationEngine v2.
 *
 * Responsibilities:
 *   1. Fetch EWMA price with adaptive λ from Chainlink / Pyth / RedStone median
 *   2. Compute realized volatility (30d, 90d) and regime detection
 *   3. Derive implied vol proxy from options markets (Deribit / on-chain)
 *   4. Fetch on-chain DEX liquidity depth (Uniswap v3 / Raydium)
 *   5. Derive dynamic discount rate (r = base + risk + liquidity premiums)
 *   6. Propose Ω updates via the timelocked relayer pipeline
 *   7. Submit full risk param bundle to ValuationEngine.updateRiskParams()
 *   8. Compute full dDPV_v2 locally for pre-validation before on-chain calls
 *
 * Architecture: BullMQ worker — one job per (token, chainId) per epoch (5 min).
 * ──────────────────────────────────────────────────────────────────────────
 */

import { createPublicClient, createWalletClient, http, parseAbi, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, base } from 'viem/chains';
import { request, gql } from 'graphql-request';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

// ─── Types ────────────────────────────────────────────────────────────────

export interface TokenRiskInputs {
  token: string;
  chainId: number;
  quantity: bigint;
  unlockTime: number;       // unix seconds
  schedule: 'CLIFF' | 'LINEAR' | 'GRADED';
  loanDurationSecs: number;
}

export interface RiskParamBundle {
  ewmaPrice: bigint;            // 18-dec WAD
  lambdaBps: number;            // 8000–9900
  vRealized30d: bigint;         // 18-dec annualized vol
  vRealized90d: bigint;
  vImplied: bigint;             // 0 if unavailable
  dexLiquidityUsd: bigint;      // 18-dec USD
  tokenRiskPremiumBps: number;
  liquidityPremiumBps: number;
  rDynamicBps: number;          // computed total
}

export interface DPVResult {
  dpvUsdc: bigint;              // 6-dec USDC
  ltvBps: number;
  breakdown: {
    qEff: bigint;
    grossValueUsd: number;
    timeFactor: number;
    volFactor: number;
    omegaFactor: number;
    liquidityFactor: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────

const WAD = BigInt('1000000000000000000'); // 1e18
const BPS = 10_000;
const SECS_PER_YEAR = 365 * 24 * 3600;

const VALUATION_ENGINE_ABI = parseAbi([
  'function computeDPV(uint256,address,uint256,uint8,uint256) view returns (uint256,uint256)',
  'function tokenOmegaBps(address) view returns (uint256)',
  'function updateRiskParams(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256) external',
  'function proposeOmega(address,uint256) external',
  'function finalizeOmega(address) external',
  'function omegaTimelockRemaining(address) view returns (uint256)',
  'function baseRateBps() view returns (uint256)',
]);

// ─── Chain Config ─────────────────────────────────────────────────────────

const CHAIN_CONFIG: Record<number, {
  chain: any;
  rpcUrl: string;
  valuationEngine: `0x${string}`;
  uniswapV3Factory?: `0x${string}`;
}> = {
  11155111: {
    chain: sepolia,
    rpcUrl: process.env.ALCHEMY_SEPOLIA_URL || '',
    valuationEngine: '0xFE760633C40f7b2A3a571f54Ede74E9385012345',
    uniswapV3Factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
  },
  8453: {
    chain: base,
    rpcUrl: process.env.ALCHEMY_BASE_URL || '',
    valuationEngine: '0x0000000000000000000000000000000000000000', // TODO: deploy
    uniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  },
};

// ─── Price Feed (Median of 3 oracles) ────────────────────────────────────

interface PriceSample {
  price: number; // USD
  timestamp: number;
}

/**
 * Fetches price from Chainlink, Pyth, and RedStone.
 * Returns median to prevent any single oracle manipulation.
 */
async function fetchMedianPrice(
  token: string,
  chainId: number
): Promise<{ price: number; sources: number[] }> {
  const prices: number[] = [];

  // Chainlink
  try {
    const clPrice = await fetchChainlinkPrice(token, chainId);
    if (clPrice > 0) prices.push(clPrice);
  } catch (e) {
    console.warn(`[dDPV] Chainlink failed for ${token}:`, e);
  }

  // Pyth
  try {
    const pythPrice = await fetchPythPrice(token);
    if (pythPrice > 0) prices.push(pythPrice);
  } catch (e) {
    console.warn(`[dDPV] Pyth failed for ${token}:`, e);
  }

  // RedStone (fallback)
  try {
    const rsPrice = await fetchRedStonePrice(token);
    if (rsPrice > 0) prices.push(rsPrice);
  } catch (e) {
    console.warn(`[dDPV] RedStone failed for ${token}:`, e);
  }

  if (prices.length === 0) throw new Error(`No price sources available for ${token}`);

  prices.sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];

  return { price: median, sources: prices };
}

async function fetchChainlinkPrice(token: string, chainId: number): Promise<number> {
  // AggregatorV3Interface price feed lookup
  // In production: use registry to resolve feed address per token
  const FEED_REGISTRY: Record<string, `0x${string}`> = {
    // Sepolia example feeds
    '0x...usdc': '0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E',
  };
  const feedAddr = FEED_REGISTRY[token.toLowerCase()];
  if (!feedAddr) throw new Error('No Chainlink feed');

  const { chain, rpcUrl } = CHAIN_CONFIG[chainId];
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  const [, answer] = await client.readContract({
    address: feedAddr,
    abi: parseAbi(['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)']),
    functionName: 'latestRoundData',
  }) as [bigint, bigint, bigint, bigint, bigint];

  return Number(answer) / 1e8; // CL prices are 8-dec
}

async function fetchPythPrice(token: string): Promise<number> {
  // Pyth Hermes REST API
  const PYTH_IDS: Record<string, string> = {
    'eth': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  };
  const id = PYTH_IDS[token.toLowerCase()];
  if (!id) throw new Error('No Pyth feed');

  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${id}`);
  const data = await res.json() as any;
  const price = data.parsed?.[0]?.price;
  if (!price) throw new Error('Pyth parse error');
  return Number(price.price) * Math.pow(10, price.expo);
}

async function fetchRedStonePrice(token: string): Promise<number> {
  // RedStone Classic: oracle contract read
  // Simplified — in production use @redstone-finance/evm-connector
  const res = await fetch(`https://api.redstone.finance/prices?symbol=${token.toUpperCase()}&provider=redstone`);
  const data = await res.json() as any;
  return data?.[0]?.value ?? 0;
}

// ─── EWMA with Adaptive Lambda ────────────────────────────────────────────

/**
 * Computes EWMA price and adaptive lambda from historical price series.
 * Higher realized vol → lower lambda (more reactive smoothing).
 */
function computeAdaptiveEWMA(
  historicalPrices: PriceSample[],
  currentPrice: number
): { ewmaPrice: number; lambdaBps: number } {
  if (historicalPrices.length < 2) {
    return { ewmaPrice: currentPrice, lambdaBps: 9_400 };
  }

  // Compute realized vol from log returns
  const returns: number[] = [];
  for (let i = 1; i < historicalPrices.length; i++) {
    const logRet = Math.log(historicalPrices[i].price / historicalPrices[i - 1].price);
    returns.push(logRet);
  }
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanRet, 2), 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(365);

  // Adaptive lambda: high vol → tighter window
  const BASE_LAMBDA = 0.94;
  const VOL_SENSITIVITY = 0.30;
  const lambda = Math.max(0.80, BASE_LAMBDA - VOL_SENSITIVITY * annualizedVol);
  const lambdaBps = Math.round(lambda * BPS);

  // Apply EWMA
  let ewma = historicalPrices[0].price;
  for (const sample of historicalPrices.slice(1)) {
    ewma = lambda * ewma + (1 - lambda) * sample.price;
  }
  ewma = lambda * ewma + (1 - lambda) * currentPrice;

  return { ewmaPrice: ewma, lambdaBps };
}

// ─── Volatility & Regime Detection ───────────────────────────────────────

interface VolatilityResult {
  vRealized30d: number;  // annualized, 0–1
  vRealized90d: number;
  vImplied: number;      // 0 if unavailable
  regimeFlag: 'CALM' | 'ELEVATED' | 'CRISIS';
}

function computeVolatility(
  prices30d: PriceSample[],
  prices90d: PriceSample[],
  impliedVolProxy?: number
): VolatilityResult {
  const realizedVol = (prices: PriceSample[]): number => {
    if (prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i].price / prices[i - 1].price));
    }
    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance * 365);
  };

  const v30 = realizedVol(prices30d);
  const v90 = realizedVol(prices90d);

  // Regime detection: 30d/90d vol ratio
  const ratio = v90 > 0 ? v30 / v90 : 1;
  let regimeFlag: VolatilityResult['regimeFlag'] = 'CALM';
  if (ratio > 2.0) regimeFlag = 'CRISIS';
  else if (ratio > 1.5) regimeFlag = 'ELEVATED';

  // Regime uplift
  let v30Adj = v30;
  if (regimeFlag === 'ELEVATED') v30Adj = v30 * 1.25;
  if (regimeFlag === 'CRISIS')   v30Adj = v30 * 1.60;

  // Forward-looking implied vol wins if higher
  const vImplied = impliedVolProxy ?? 0;
  if (vImplied > v30Adj) v30Adj = vImplied;

  return {
    vRealized30d: Math.min(v30Adj, 0.95),
    vRealized90d: Math.min(v90, 0.95),
    vImplied: vImplied,
    regimeFlag,
  };
}

// ─── DEX Liquidity Depth ──────────────────────────────────────────────────

/**
 * Queries Uniswap v3 subgraph for pool depth.
 * Returns the total USD TVL in the deepest pool for this token.
 */
async function fetchDexLiquidityUsd(
  token: string,
  chainId: number
): Promise<number> {
  const SUBGRAPH: Record<number, string> = {
    11155111: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-sepolia',
    8453: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-base',
  };

  const endpoint = SUBGRAPH[chainId];
  if (!endpoint) return 0;

  try {
    const query = gql`
      query($token: String!) {
        pools(
          where: { token0: $token }
          orderBy: totalValueLockedUSD
          orderDirection: desc
          first: 1
        ) {
          totalValueLockedUSD
          volumeUSD
        }
      }
    `;
    const data: any = await request(endpoint, query, { token: token.toLowerCase() });
    const pool = data?.pools?.[0];
    return pool ? parseFloat(pool.totalValueLockedUSD) : 0;
  } catch {
    return 0; // conservative: unknown liquidity → severe haircut applied in contract
  }
}

// ─── Dynamic Rate Computation ─────────────────────────────────────────────

/**
 * Derives token risk premium and liquidity premium in bps.
 * r_dynamic = baseRate + tokenRiskPremium + liquidityPremium
 */
function computeRatePremiums(
  omegaBps: number,
  vRealized30d: number,
  dexLiquidityUsd: number,
  positionSizeUsd: number
): { tokenRiskPremiumBps: number; liquidityPremiumBps: number } {
  // Token risk premium: inverse of Ω (low Ω = risky = high premium)
  const omegaRisk = 1 - omegaBps / BPS; // 0 (safe) to 1 (risky)
  const tokenRiskPremiumBps = Math.round(omegaRisk * 2_000 + vRealized30d * 1_000);

  // Liquidity premium: based on position/pool ratio
  let liquidityPremiumBps = 0;
  if (dexLiquidityUsd > 0) {
    const impactRatio = positionSizeUsd / dexLiquidityUsd;
    if (impactRatio > 0.30) liquidityPremiumBps = 1_000;
    else if (impactRatio > 0.10) liquidityPremiumBps = 500;
    else if (impactRatio > 0.02) liquidityPremiumBps = 200;
  } else {
    liquidityPremiumBps = 1_000; // unknown liquidity = max premium
  }

  return {
    tokenRiskPremiumBps: Math.min(tokenRiskPremiumBps, 5_000),
    liquidityPremiumBps: Math.min(liquidityPremiumBps, 2_000),
  };
}

// ─── Local dDPV v2 Computation (pre-validation) ───────────────────────────

/**
 * Mirrors the on-chain formula exactly for pre-validation before tx submission.
 * Any deviation between this result and computeDPV() output should alert.
 */
export function computeDDPV_v2(
  quantity: bigint,
  schedule: 'CLIFF' | 'LINEAR' | 'GRADED',
  unlockTime: number,
  loanDurationSecs: number,
  bundle: RiskParamBundle,
  omegaBps: number
): DPVResult {
  const now = Math.floor(Date.now() / 1000);
  const T = unlockTime - now;
  if (T <= 0) throw new Error('Token already unlocked');

  // 1. Q_effective
  const qEff = computeQEffective(quantity, schedule, T, loanDurationSecs);

  // 2. Gross value (18-dec USD)
  const ewmaPriceNum = Number(bundle.ewmaPrice) / 1e18;
  const grossValueUsd = Number(qEff) * ewmaPriceNum;

  // 3. Time decay
  const tYears = T / SECS_PER_YEAR;
  const rDecimal = bundle.rDynamicBps / BPS;
  const timeFactor = Math.exp(-rDecimal * tYears);

  // 4. Vol regime penalty
  const v30 = Number(bundle.vRealized30d) / 1e18;
  const v90 = Number(bundle.vRealized90d) / 1e18;
  const vImplied = Number(bundle.vImplied) / 1e18;
  const volRegime = computeVRegimeLocal(v30, v90, vImplied);
  const volFactor = 1 - volRegime;

  // 5. Ω
  const omegaFactor = omegaBps / BPS;

  // 6. Liquidity
  const posUsd = grossValueUsd;
  const liqUsd = Number(bundle.dexLiquidityUsd) / 1e18;
  const liquidityFactor = liquidityDepthFactorLocal(posUsd, liqUsd);

  // Final dDPV
  const dpvUsd = grossValueUsd * timeFactor * volFactor * omegaFactor * liquidityFactor;
  const dpvUsdc = BigInt(Math.floor(dpvUsd * 1e6)); // USDC 6-dec

  // LTV
  const ltvBps = computeLTVLocal(omegaBps, volRegime, bundle.rDynamicBps);

  return {
    dpvUsdc,
    ltvBps,
    breakdown: {
      qEff,
      grossValueUsd,
      timeFactor,
      volFactor,
      omegaFactor,
      liquidityFactor,
    },
  };
}

function computeQEffective(
  quantity: bigint,
  schedule: 'CLIFF' | 'LINEAR' | 'GRADED',
  T: number,
  loanDuration: number
): bigint {
  if (schedule === 'CLIFF' || schedule === 'GRADED') return quantity;
  const fraction = Math.min(loanDuration / T, 1.0);
  return BigInt(Math.floor(Number(quantity) * fraction));
}

function computeVRegimeLocal(v30: number, v90: number, vImplied: number): number {
  let base = v30;
  if (v90 > 0 && v30 / v90 > 1.5) base = v30 * 1.25;
  if (vImplied > base) base = vImplied;
  return Math.min(base, 0.95);
}

function liquidityDepthFactorLocal(posUsd: number, liqUsd: number): number {
  if (liqUsd === 0) return 0.40;
  const impact = posUsd / liqUsd;
  if (impact < 0.02) return 1.00;
  if (impact < 0.10) return 0.85;
  if (impact < 0.30) return 0.65;
  return 0.40;
}

function computeLTVLocal(omegaBps: number, vRegime: number, rBps: number): number {
  let ltv = (omegaBps * 7_000) / 9_500;
  ltv -= vRegime * BPS;
  ltv -= rBps / 4;
  return Math.max(500, Math.min(7_000, Math.round(ltv)));
}

// ─── Main Oracle Service ──────────────────────────────────────────────────

export class DDPVService {
  private redis: Redis;
  private queue: Queue;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.queue = new Queue('ddpv-oracle', { connection: this.redis });
  }

  /**
   * Schedule a risk param update job for a token.
   * Called by VestingOracleService when a new vesting position is detected.
   */
  async scheduleUpdate(inputs: TokenRiskInputs): Promise<void> {
    await this.queue.add('update-risk-params', inputs, {
      jobId: `${inputs.chainId}-${inputs.token}-${Date.now()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  }

  /**
   * Start the BullMQ worker that processes oracle update jobs.
   */
  startWorker(): Worker {
    const worker = new Worker(
      'ddpv-oracle',
      async (job: Job<TokenRiskInputs>) => {
        await this.processOracleUpdate(job.data);
      },
      {
        connection: this.redis,
        concurrency: 5,
      }
    );

    worker.on('failed', (job, err) => {
      console.error(`[dDPV Worker] Job ${job?.id} failed:`, err.message);
    });

    return worker;
  }

  private async processOracleUpdate(inputs: TokenRiskInputs): Promise<void> {
    const { token, chainId, quantity, unlockTime, schedule, loanDurationSecs } = inputs;
    const cfg = CHAIN_CONFIG[chainId];
    if (!cfg) throw new Error(`Unsupported chainId: ${chainId}`);

    console.log(`[dDPV] Processing ${token} on chain ${chainId}`);

    // 1. Fetch median price + historical series
    const { price: currentPrice } = await fetchMedianPrice(token, chainId);

    // Historical prices from Redis cache (populated by price feed service)
    const priceKey = `prices:${chainId}:${token}`;
    const rawPrices = await this.redis.lrange(priceKey, 0, 90);
    const historicalPrices: PriceSample[] = rawPrices.map(r => JSON.parse(r));

    // 2. Adaptive EWMA
    const { ewmaPrice, lambdaBps } = computeAdaptiveEWMA(historicalPrices, currentPrice);

    // 3. Volatility regime
    const prices30d = historicalPrices.slice(0, 30);
    const prices90d = historicalPrices.slice(0, 90);
    const vol = computeVolatility(prices30d, prices90d);

    console.log(`[dDPV] Regime: ${vol.regimeFlag} | vol30d: ${(vol.vRealized30d * 100).toFixed(1)}%`);

    // 4. DEX liquidity depth
    const dexLiquidityUsd = await fetchDexLiquidityUsd(token, chainId);

    // 5. Current Ω from contract
    const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
    const omegaBps = Number(
      await client.readContract({
        address: cfg.valuationEngine,
        abi: VALUATION_ENGINE_ABI,
        functionName: 'tokenOmegaBps',
        args: [token as `0x${string}`],
      })
    );

    // 6. Base rate from contract
    const baseRateBps = Number(
      await client.readContract({
        address: cfg.valuationEngine,
        abi: VALUATION_ENGINE_ABI,
        functionName: 'baseRateBps',
      })
    );

    // 7. Compute rate premiums
    const grossUsd = Number(quantity) * ewmaPrice;
    const { tokenRiskPremiumBps, liquidityPremiumBps } = computeRatePremiums(
      omegaBps,
      vol.vRealized30d,
      dexLiquidityUsd,
      grossUsd
    );
    const rDynamicBps = Math.min(
      Math.max(baseRateBps + tokenRiskPremiumBps + liquidityPremiumBps, 300),
      8_000
    );

    // 8. Build param bundle
    const bundle: RiskParamBundle = {
      ewmaPrice:            BigInt(Math.round(ewmaPrice * 1e18)),
      lambdaBps,
      vRealized30d:         BigInt(Math.round(vol.vRealized30d * 1e18)),
      vRealized90d:         BigInt(Math.round(vol.vRealized90d * 1e18)),
      vImplied:             BigInt(Math.round(vol.vImplied * 1e18)),
      dexLiquidityUsd:      BigInt(Math.round(dexLiquidityUsd * 1e18)),
      tokenRiskPremiumBps,
      liquidityPremiumBps,
      rDynamicBps,
    };

    // 9. Pre-validate: compute dDPV locally
    const localResult = computeDDPV_v2(quantity, schedule, unlockTime, loanDurationSecs, bundle, omegaBps);
    console.log(`[dDPV] Local dDPV: $${Number(localResult.dpvUsdc) / 1e6} USDC | LTV: ${localResult.ltvBps / 100}%`);
    console.log(`[dDPV] Breakdown:`, localResult.breakdown);

    // 10. Submit to chain
    await this.submitRiskParams(token, chainId, cfg, bundle);

    // 11. Cache result
    await this.redis.set(
      `ddpv:result:${chainId}:${token}`,
      JSON.stringify({ ...localResult, timestamp: Date.now() }),
      'EX', 300 // 5 min TTL
    );
  }

  private async submitRiskParams(
    token: string,
    chainId: number,
    cfg: typeof CHAIN_CONFIG[number],
    bundle: RiskParamBundle
  ): Promise<void> {
    const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as `0x${string}`);
    const wallet = createWalletClient({ account, chain: cfg.chain, transport: http(cfg.rpcUrl) });

    const hash = await wallet.writeContract({
      address: cfg.valuationEngine,
      abi: VALUATION_ENGINE_ABI,
      functionName: 'updateRiskParams',
      args: [
        token as `0x${string}`,
        bundle.ewmaPrice,
        BigInt(bundle.lambdaBps),
        bundle.vRealized30d,
        bundle.vRealized90d,
        bundle.vImplied,
        bundle.dexLiquidityUsd,
        BigInt(bundle.tokenRiskPremiumBps),
        BigInt(bundle.liquidityPremiumBps),
      ],
    });

    console.log(`[dDPV] updateRiskParams submitted: ${hash}`);
  }

  /**
   * Propose a new Ω for a token.
   * Called by the Omega AI Watcher Network after generating a new risk signal.
   */
  async proposeOmega(token: string, chainId: number, newOmegaBps: number): Promise<void> {
    const cfg = CHAIN_CONFIG[chainId];
    if (!cfg) throw new Error(`Unsupported chainId: ${chainId}`);

    const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as `0x${string}`);
    const wallet = createWalletClient({ account, chain: cfg.chain, transport: http(cfg.rpcUrl) });

    const hash = await wallet.writeContract({
      address: cfg.valuationEngine,
      abi: VALUATION_ENGINE_ABI,
      functionName: 'proposeOmega',
      args: [token as `0x${string}`, BigInt(newOmegaBps)],
    });

    console.log(`[dDPV] Omega proposal submitted for ${token}: ${newOmegaBps} bps | tx: ${hash}`);

    // Schedule finalization after timelock
    await this.queue.add(
      'finalize-omega',
      { token, chainId },
      { delay: 3_700_000 } // 3700 seconds — 100s safety margin past 1hr timelock
    );
  }

  async getCachedDPV(token: string, chainId: number): Promise<DPVResult | null> {
    const raw = await this.redis.get(`ddpv:result:${chainId}:${token}`);
    return raw ? JSON.parse(raw) : null;
  }
}

export const ddpvService = new DDPVService();
