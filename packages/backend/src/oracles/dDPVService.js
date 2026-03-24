"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ddpvService = exports.DDPVService = void 0;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const graphql_request_1 = require("graphql-request");
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");

const asiChain = (0, viem_1.defineChain)({
    id: 192,
    name: 'ASI Chain',
    nativeCurrency: { name: 'Fetch', symbol: 'FET', decimals: 18 },
    rpcUrls: {
        default: {
            http: [process.env.ASI_RPC_URL || 'https://rpc.asi.network'],
        },
    },
    blockExplorers: {
        default: {
            name: 'ASI Explorer',
            url: 'https://explorer.asi.network',
            apiUrl: 'https://explorer.asi.network/api',
        },
    },
    contracts: {},
});

const WAD = BigInt('1000000000000000000');
const BPS = 10000;
const SECS_PER_YEAR = 365 * 24 * 3600;

const VALUATION_ENGINE_ABI = (0, viem_1.parseAbi)([
    'function computeDPV(uint256,address,uint256,uint8,uint256) view returns (uint256,uint256)',
    'function tokenOmegaBps(address) view returns (uint256)',
    'function updateRiskParams(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256) external',
    'function proposeOmega(address,uint256) external',
    'function finalizeOmega(address) external',
    'function omegaTimelockRemaining(address) view returns (uint256)',
    'function baseRateBps() view returns (uint256)',
]);

const CHAIN_CONFIG = {
    11155111: {
        chain: chains_1.sepolia,
        rpcUrl: process.env.ALCHEMY_SEPOLIA_URL || '',
        valuationEngine: '0xFE760633C40f7b2A3a571f54Ede74E9385012345',
        uniswapV3Factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
        dexType: 'uniswapv3',
    },
    8453: {
        chain: chains_1.base,
        rpcUrl: process.env.ALCHEMY_BASE_URL || '',
        valuationEngine: (process.env.VALUATION_ENGINE_BASE || '0x0000000000000000000000000000000000000000'),
        uniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
        dexType: 'uniswapv3',
    },
    192: {
        chain: asiChain,
        rpcUrl: process.env.ASI_RPC_URL || 'https://rpc.asi.network',
        valuationEngine: (process.env.VALUATION_ENGINE_ASI || '0x0000000000000000000000000000000000000000'),
        dexType: 'dojoswap',
        dojoswapFactory: (process.env.DOJOSWAP_FACTORY_ASI || '0x0000000000000000000000000000000000000000'),
    },
};

const UNISWAP_V3_SUBGRAPH = {
    11155111: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-sepolia',
    8453: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-base',
};

async function fetchMedianPrice(token, chainId) {
    const prices = [];
    try {
        const clPrice = await fetchChainlinkPrice(token, chainId);
        if (clPrice > 0)
            prices.push(clPrice);
    }
    catch (e) {
        console.warn(`[dDPV] Chainlink failed for ${token}:`, e);
    }
    try {
        const pythPrice = await fetchPythPrice(token);
        if (pythPrice > 0)
            prices.push(pythPrice);
    }
    catch (e) {
        console.warn(`[dDPV] Pyth failed for ${token}:`, e);
    }
    try {
        const rsPrice = await fetchRedStonePrice(token);
        if (rsPrice > 0)
            prices.push(rsPrice);
    }
    catch (e) {
        console.warn(`[dDPV] RedStone failed for ${token}:`, e);
    }
    if (prices.length === 0)
        throw new Error(`No price sources available for ${token}`);
    prices.sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    return { price: median, sources: prices };
}

async function fetchChainlinkPrice(token, chainId) {
    const FEED_REGISTRY = {
        '0x...usdc': '0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E',
    };
    const feedAddr = FEED_REGISTRY[token.toLowerCase()];
    if (!feedAddr)
        throw new Error('No Chainlink feed');
    const { chain, rpcUrl } = CHAIN_CONFIG[chainId];
    const client = (0, viem_1.createPublicClient)({ chain, transport: (0, viem_1.http)(rpcUrl) });
    const [, answer] = await client.readContract({
        address: feedAddr,
        abi: (0, viem_1.parseAbi)(['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)']),
        functionName: 'latestRoundData',
    });
    return Number(answer) / 1e8;
}

async function fetchPythPrice(token) {
    const PYTH_IDS = {
        'eth': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    };
    const id = PYTH_IDS[token.toLowerCase()];
    if (!id)
        throw new Error('No Pyth feed');
    const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${id}`);
    const data = await res.json();
    const price = data.parsed?.[0]?.price;
    if (!price)
        throw new Error('Pyth parse error');
    return Number(price.price) * Math.pow(10, price.expo);
}

async function fetchRedStonePrice(token) {
    const res = await fetch(`https://api.redstone.finance/prices?symbol=${token.toUpperCase()}&provider=redstone`);
    const data = await res.json();
    return data?.[0]?.value ?? 0;
}

function computeAdaptiveEWMA(historicalPrices, currentPrice) {
    if (historicalPrices.length < 2) {
        return { ewmaPrice: currentPrice, lambdaBps: 9400 };
    }
    const returns = [];
    for (let i = 1; i < historicalPrices.length; i++) {
        const logRet = Math.log(historicalPrices[i].price / historicalPrices[i - 1].price);
        returns.push(logRet);
    }
    const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanRet, 2), 0) / returns.length;
    const dailyVol = Math.sqrt(variance);
    const annualizedVol = dailyVol * Math.sqrt(365);
    const BASE_LAMBDA = 0.94;
    const VOL_SENSITIVITY = 0.30;
    const lambda = Math.max(0.80, BASE_LAMBDA - VOL_SENSITIVITY * annualizedVol);
    const lambdaBps = Math.round(lambda * BPS);
    let ewma = historicalPrices[0].price;
    for (const sample of historicalPrices.slice(1)) {
        ewma = lambda * ewma + (1 - lambda) * sample.price;
    }
    ewma = lambda * ewma + (1 - lambda) * currentPrice;
    return { ewmaPrice: ewma, lambdaBps };
}
exports.computeAdaptiveEWMA = computeAdaptiveEWMA;

function computeVolatility(prices30d, prices90d, impliedVolProxy) {
    const realizedVol = (prices) => {
        if (prices.length < 2)
            return 0;
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
    const ratio = v90 > 0 ? v30 / v90 : 1;
    let regimeFlag = 'CALM';
    if (ratio > 2.0)
        regimeFlag = 'CRISIS';
    else if (ratio > 1.5)
        regimeFlag = 'ELEVATED';
    let v30Adj = v30;
    if (regimeFlag === 'ELEVATED')
        v30Adj = v30 * 1.25;
    if (regimeFlag === 'CRISIS')
        v30Adj = v30 * 1.60;
    const vImplied = impliedVolProxy ?? 0;
    if (vImplied > v30Adj)
        v30Adj = vImplied;
    return {
        vRealized30d: Math.min(v30Adj, 0.95),
        vRealized90d: Math.min(v90, 0.95),
        vImplied: vImplied,
        regimeFlag,
    };
}
exports.computeVolatility = computeVolatility;

async function fetchDexLiquidityUsd(token, chainId) {
    const cfg = CHAIN_CONFIG[chainId];
    if (!cfg)
        return 0;
    if (cfg.dexType === 'uniswapv3' || !cfg.dexType) {
        const endpoint = UNISWAP_V3_SUBGRAPH[chainId];
        if (!endpoint)
            return 0;
        try {
            const query = (0, graphql_request_1.gql) `
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
            const data = await (0, graphql_request_1.request)(endpoint, query, { token: token.toLowerCase() });
            const pool = data?.pools?.[0];
            return pool ? parseFloat(pool.totalValueLockedUSD) : 0;
        }
        catch {
            return 0;
        }
    }
    if (cfg.dexType === 'dojoswap') {
        if (!cfg.dojoswapFactory || cfg.dojoswapFactory === '0x0000000000000000000000000000000000000000') {
            console.warn('[dDPV] DojoSwap factory not configured for ASI Chain — using 0 liquidity (40% haircut)');
            return 0;
        }
        try {
            const client = (0, viem_1.createPublicClient)({
                chain: cfg.chain,
                transport: (0, viem_1.http)(cfg.rpcUrl),
            });
            const FACTORY_ABI = (0, viem_1.parseAbi)([
                'function getPair(address,address) view returns (address)',
            ]);
            const WFET_ASI = (process.env.WFET_ASI_ADDRESS || '0x0000000000000000000000000000000000000000');
            const pairAddress = await client.readContract({
                address: cfg.dojoswapFactory,
                abi: FACTORY_ABI,
                functionName: 'getPair',
                args: [token, WFET_ASI],
            });
            if (!pairAddress || pairAddress === '0x0000000000000000000000000000000000000000') {
                return 0;
            }
            const PAIR_ABI = (0, viem_1.parseAbi)([
                'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
                'function token0() view returns (address)',
            ]);
            const [reserves, token0] = await Promise.all([
                client.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'getReserves' }),
                client.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'token0' }),
            ]);
            const [reserve0, reserve1] = reserves;
            const tokenIsToken0 = token0.toLowerCase() === token.toLowerCase();
            const wfetReserve = tokenIsToken0 ? reserve1 : reserve0;
            const fetPriceUsd = await fetchFetPriceUsd();
            const wfetDecimals = 18;
            const wfetUsd = (Number(wfetReserve) / 10 ** wfetDecimals) * fetPriceUsd;
            const totalPoolUsd = wfetUsd * 2;
            return totalPoolUsd;
        }
        catch (err) {
            console.warn('[dDPV] DojoSwap liquidity fetch failed:', err.message);
            return 0;
        }
    }
    return 0;
}

async function fetchFetPriceUsd() {
    const PYTH_FET_ID = process.env.PYTH_FET_FEED_ID || '0x2d9315a88f3019f8efa88dfe9c0f0843712da0bac814461e27733f6b83eb51b3';
    try {
        const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FET_ID}`);
        const data = await res.json();
        const p = data.parsed?.[0]?.price;
        if (p)
            return Number(p.price) * Math.pow(10, p.expo);
    }
    catch { }
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=fetch-ai&vs_currencies=usd');
        const data = await res.json();
        return data?.['fetch-ai']?.usd ?? 0;
    }
    catch {
        return 0;
    }
}

function computeRatePremiums(omegaBps, vRealized30d, dexLiquidityUsd, positionSizeUsd) {
    const omegaRisk = 1 - omegaBps / BPS;
    const tokenRiskPremiumBps = Math.round(omegaRisk * 2000 + vRealized30d * 1000);
    let liquidityPremiumBps = 0;
    if (dexLiquidityUsd > 0) {
        const impactRatio = positionSizeUsd / dexLiquidityUsd;
        if (impactRatio > 0.30)
            liquidityPremiumBps = 1000;
        else if (impactRatio > 0.10)
            liquidityPremiumBps = 500;
        else if (impactRatio > 0.02)
            liquidityPremiumBps = 200;
    }
    else {
        liquidityPremiumBps = 1000;
    }
    return {
        tokenRiskPremiumBps: Math.min(tokenRiskPremiumBps, 5000),
        liquidityPremiumBps: Math.min(liquidityPremiumBps, 2000),
    };
}
exports.computeRatePremiums = computeRatePremiums;

function computeDDPV_v2(quantity, schedule, unlockTime, loanDurationSecs, bundle, omegaBps) {
    const now = Math.floor(Date.now() / 1000);
    const T = unlockTime - now;
    if (T <= 0)
        throw new Error('Token already unlocked');
    const qEff = computeQEffective(quantity, schedule, T, loanDurationSecs);
    const ewmaPriceNum = Number(bundle.ewmaPrice) / 1e18;
    const grossValueUsd = (Number(qEff) / 1e18) * ewmaPriceNum;
    const tYears = T / SECS_PER_YEAR;
    const rDecimal = bundle.rDynamicBps / BPS;
    const timeFactor = Math.exp(-rDecimal * tYears);
    const v30 = Number(bundle.vRealized30d) / 1e18;
    const v90 = Number(bundle.vRealized90d) / 1e18;
    const vImplied = Number(bundle.vImplied) / 1e18;
    const volRegime = computeVRegimeLocal(v30, v90, vImplied);
    const volFactor = 1 - volRegime;
    const omegaFactor = omegaBps / BPS;
    const posUsd = grossValueUsd;
    const liqUsd = Number(bundle.dexLiquidityUsd) / 1e18;
    const liquidityFactor = liquidityDepthFactorLocal(posUsd, liqUsd);
    const dpvUsd = grossValueUsd * timeFactor * volFactor * omegaFactor * liquidityFactor;
    const dpvUsdc = BigInt(Math.floor(dpvUsd * 1e6));
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
exports.computeDDPV_v2 = computeDDPV_v2;

function computeQEffective(quantity, schedule, T, loanDuration) {
    if (schedule === 'CLIFF' || schedule === 'GRADED')
        return quantity;
    const fraction = Math.min(loanDuration / T, 1.0);
    return BigInt(Math.floor(Number(quantity) * fraction));
}

function computeVRegimeLocal(v30, v90, vImplied) {
    let base = v30;
    if (v90 > 0 && v30 / v90 > 1.5)
        base = v30 * 1.25;
    if (vImplied > base)
        base = vImplied;
    return Math.min(base, 0.95);
}

function liquidityDepthFactorLocal(posUsd, liqUsd) {
    if (liqUsd === 0)
        return 0.40;
    const impact = posUsd / liqUsd;
    if (impact < 0.02)
        return 1.00;
    if (impact < 0.10)
        return 0.85;
    if (impact < 0.30)
        return 0.65;
    return 0.40;
}

function computeLTVLocal(omegaBps, vRegime, rBps) {
    let ltv = (omegaBps * 7000) / 9500;
    ltv -= vRegime * BPS;
    ltv -= rBps / 4;
    return Math.max(500, Math.min(7000, Math.round(ltv)));
}

class DDPVService {
    constructor() {
        this.redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
        this.redis.on('error', (err) => {
            console.warn('[dDPVService] Redis error:', err.message);
        });
        this.queue = new bullmq_1.Queue('ddpv-oracle', { connection: this.redis });
    }
    async scheduleUpdate(inputs) {
        const jobId = `${inputs.chainId}-${inputs.token}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await this.queue.add('update-risk-params', inputs, {
            jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
        });
    }
    startWorker() {
        const worker = new bullmq_1.Worker('ddpv-oracle', async (job) => {
            await this.processOracleUpdate(job.data);
        }, {
            connection: this.redis,
            concurrency: 5,
        });
        worker.on('failed', (job, err) => {
            console.error(`[dDPV Worker] Job ${job?.id} failed:`, err.message);
        });
        return worker;
    }
    async processOracleUpdate(inputs) {
        const { token, chainId, quantity, unlockTime, schedule, loanDurationSecs } = inputs;
        const cfg = CHAIN_CONFIG[chainId];
        if (!cfg)
            throw new Error(`Unsupported chainId: ${chainId}`);
        console.log(`[dDPV] Processing ${token} on chain ${chainId}`);
        const { price: currentPrice } = await fetchMedianPrice(token, chainId);
        const priceKey = `prices:${chainId}:${token}`;
        const rawPrices = await this.redis.lrange(priceKey, 0, 90);
        const historicalPrices = rawPrices.map(r => JSON.parse(r));
        const { ewmaPrice, lambdaBps } = computeAdaptiveEWMA(historicalPrices, currentPrice);
        const prices30d = historicalPrices.slice(0, 30);
        const prices90d = historicalPrices.slice(0, 90);
        const vol = computeVolatility(prices30d, prices90d);
        console.log(`[dDPV] Regime: ${vol.regimeFlag} | vol30d: ${(vol.vRealized30d * 100).toFixed(1)}%`);
        const dexLiquidityUsd = await fetchDexLiquidityUsd(token, chainId);
        const client = (0, viem_1.createPublicClient)({ chain: cfg.chain, transport: (0, viem_1.http)(cfg.rpcUrl) });
        const omegaBps = Number(await client.readContract({
            address: cfg.valuationEngine,
            abi: VALUATION_ENGINE_ABI,
            functionName: 'tokenOmegaBps',
            args: [token],
        }));
        const baseRateBps = Number(await client.readContract({
            address: cfg.valuationEngine,
            abi: VALUATION_ENGINE_ABI,
            functionName: 'baseRateBps',
        }));
        const grossUsd = Number(quantity) * ewmaPrice;
        const { tokenRiskPremiumBps, liquidityPremiumBps } = computeRatePremiums(omegaBps, vol.vRealized30d, dexLiquidityUsd, grossUsd);
        const rDynamicBps = Math.min(Math.max(baseRateBps + tokenRiskPremiumBps + liquidityPremiumBps, 300), 8000);
        const bundle = {
            ewmaPrice: BigInt(Math.round(ewmaPrice * 1e18)),
            lambdaBps,
            vRealized30d: BigInt(Math.round(vol.vRealized30d * 1e18)),
            vRealized90d: BigInt(Math.round(vol.vRealized90d * 1e18)),
            vImplied: BigInt(Math.round(vol.vImplied * 1e18)),
            dexLiquidityUsd: BigInt(Math.round(dexLiquidityUsd * 1e18)),
            tokenRiskPremiumBps,
            liquidityPremiumBps,
            rDynamicBps,
        };
        const localResult = computeDDPV_v2(quantity, schedule, unlockTime, loanDurationSecs, bundle, omegaBps);
        console.log(`[dDPV] Local dDPV: $${Number(localResult.dpvUsdc) / 1e6} USDC | LTV: ${localResult.ltvBps / 100}%`);
        console.log(`[dDPV] Breakdown:`, localResult.breakdown);
        await this.submitRiskParams(token, chainId, cfg, bundle);
        await this.redis.set(`ddpv:result:${chainId}:${token}`, JSON.stringify({ ...localResult, timestamp: Date.now() }, (_, v) => (typeof v === 'bigint' ? v.toString() : v)), 'EX', 300);
    }
    async submitRiskParams(token, chainId, cfg, bundle) {
        const account = (0, accounts_1.privateKeyToAccount)(process.env.RELAYER_PRIVATE_KEY);
        const wallet = (0, viem_1.createWalletClient)({ account, chain: cfg.chain, transport: (0, viem_1.http)(cfg.rpcUrl) });
        const hash = await wallet.writeContract({
            address: cfg.valuationEngine,
            abi: VALUATION_ENGINE_ABI,
            functionName: 'updateRiskParams',
            chain: cfg.chain,
            account,
            args: [
                token,
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
    async proposeOmega(token, chainId, newOmegaBps) {
        const cfg = CHAIN_CONFIG[chainId];
        if (!cfg)
            throw new Error(`Unsupported chainId: ${chainId}`);
        const account = (0, accounts_1.privateKeyToAccount)(process.env.RELAYER_PRIVATE_KEY);
        const wallet = (0, viem_1.createWalletClient)({ account, chain: cfg.chain, transport: (0, viem_1.http)(cfg.rpcUrl) });
        const hash = await wallet.writeContract({
            address: cfg.valuationEngine,
            abi: VALUATION_ENGINE_ABI,
            functionName: 'proposeOmega',
            chain: cfg.chain,
            account,
            args: [token, BigInt(newOmegaBps)],
        });
        console.log(`[dDPV] Omega proposal submitted for ${token}: ${newOmegaBps} bps | tx: ${hash}`);
        await this.queue.add('finalize-omega', { token, chainId }, { delay: 3700000 });
    }
    async getCachedDPV(token, chainId) {
        const raw = await this.redis.get(`ddpv:result:${chainId}:${token}`);
        return raw ? JSON.parse(raw) : null;
    }
}
exports.DDPVService = DDPVService;
exports.ddpvService = new DDPVService();
