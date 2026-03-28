// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const path = require('path');
const crypto = require('crypto');
// Prefer backend/.env for local backend runs; fallback to repo-root .env if present.
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { fetch } = require('undici');
const fs = require('fs');
const { ethers } = require('ethers');
const { PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const { z } = require('zod');
const { initAgent, answerAgent } = require('./agent');
const persistence = require('./persistence');
const {
  calculateIdentityCreditScore,
  policyCheck
} = require('./identityCreditScore');
const {
  fetchStreamflowVestingContracts,
  getUnmappedMints
} = require('./solana/streamflow');
const { fetchSablierStreams } = require('./evm/sablier');
const { fetchSuperfluidStreams } = require('./evm/superfluid');
const { fetchBonfidaVesting } = require('./solana/bonfida');
const { vestingOracle } = require('./src/oracles/VestingOracleService');
const { priceHistoryCache } = require('./src/oracles/PriceHistoryCache');
const {
  getRepayConfig,
  buildRepayPlan,
  executeRepaySweep
} = require('./solana/repay');
const {
  deployVestraVault,
  execViaVault,
  getRelayerWallet,
  deploySablierV2OperatorWrapper,
  deploySablierV2FlowWrapper,
  deployOZVestingClaimWrapper,
  deployTokenTimelockClaimWrapper,
  deploySuperfluidClaimWrapper
} = require('./relayer/evmRelayer');
const { mapWithConcurrency } = require('./lib/concurrency');
const { uploadJSONToIPFS } = require('./lib/ipfs');
const meTTabrain = require('./meTTabrain');
const omegaWatcher = require('./omegaWatcher');
const sovereignRelayer = require('./relayer/SovereignRelayer');
const rnodeService = require('./rholang/rnodeService');
const SovereignDataService = require('./lib/SovereignDataService');

// Service Imports
const RelayerService = require('./services/RelayerService');
const LoanExecutionService = require('./services/LoanExecutionService');
const LendingService = require('./services/LendingService');
const IndexerService = require('./services/IndexerService');
const OmegaService = require('./services/OmegaService');
const AirdropService = require('./services/AirdropService');

// Contract ABIs
const {
  erc20Abi,
  erc20ReadAbi,
  communityPoolReadAbi,
  vestingWalletReadAbi
} = require('./contracts/abis');

// Utilities
const {
  isPlainObject,
  normalizeText,
  normalizeEmail,
  toNumber,
  toBigIntSafe,
  normalizeWalletAddress,
  normalizeSolanaAddress,
  normalizeAnyWalletAddress,
  detectChainTypeForWallet,
  hashIp,
  isPrivateOrLocalIp
} = require('./lib/utils');

const {
  lookupGeoByIp,
  captureUserGeoPresence
} = require('./lib/geo');

const {
  getSessionToken,
  getClientIp,
  buildSessionFingerprint,
  secureEqual,
  requireAdmin: requireAdminFactory,
  attachSession,
  requireSession: requireSessionFactory,
  requireWalletOwnerParam: requireWalletOwnerParamFactory,
  createLimiters
} = require('./lib/auth');


const {
  vestingValidateSchema,
  fundraisingLinkSchema,
  poolPreferencesSchema,
  createPoolSchema,
  updatePoolSchema,
  matchQuoteSchema,
  matchAcceptSchema,
  walletNonceSchema,
  walletVerifySchema,
  linkWalletSchema,
  solanaNonceSchema,
  solanaLinkWalletSchema,
  privateLoanCreateSchema,
  privateLoanRepaySchema,
  privateLoanSettleSchema,
  sablierUpgradeSchema,
  ozUpgradeSchema,
  timelockUpgradeSchema,
  superfluidUpgradeSchema,
  solanaRepaySchema,
  chatSchema,
  analyticsSchema,
  chainRequestSchema,
  notifySchema,
  governanceSchema,
  contactSchema,
  writeSchema,
  docsOpenSchema,
  adminIdentityPatchSchema
} = require('./lib/schemas');

const {
  toUsdFromUsdcUnits,
  getDaysToUnlock,
  buildWalletMessage,
  buildSolanaLinkMessage,
  verifySolanaDetachedSignature: verifySolanaDetachedSignatureFactory
} = require('./lib/utils');

const verifySolanaDetachedSignature = verifySolanaDetachedSignatureFactory(nacl, PublicKey);


const app = express();
const port = process.env.PORT || 4000;

app.get('/api/test-root', (req, res) => res.json({ ok: true, message: 'Root matched' }));

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined) {
  app.set('trust proxy', trustProxy === 'true' ? true : Number(trustProxy));
}

const RPC_URL =
  process.env.RPC_URL ||
  process.env.ALCHEMY_SEPOLIA_URL ||
  process.env.INFURA_SEPOLIA_URL ||
  'https://rpc.sepolia.org';
const INDEXER_ENABLED = process.env.INDEXER_ENABLED !== 'false';
const INDEXER_LOOKBACK_BLOCKS = Number(
  process.env.INDEXER_LOOKBACK_BLOCKS || 2000
);
const INDEXER_POLL_INTERVAL_MS = Number(
  process.env.INDEXER_POLL_INTERVAL_MS || 15000
);
const INDEXER_MAX_BLOCKS_PER_POLL = Number(
  process.env.INDEXER_MAX_BLOCKS_PER_POLL || 500
);
const INDEXER_MAX_EVENTS = Number(process.env.INDEXER_MAX_EVENTS || 200);
const INDEXER_VESTED_LIMIT = Number(process.env.INDEXER_VESTED_LIMIT || 20);
const INDEXER_SNAPSHOT_INTERVAL_MS = Number(
  process.env.INDEXER_SNAPSHOT_INTERVAL_MS || 60000
);
const INDEXER_SNAPSHOT_LIMIT = Number(process.env.INDEXER_SNAPSHOT_LIMIT || 24);
const VESTED_CACHE_TTL_MS = Number(process.env.VESTED_CACHE_TTL_MS || 30000);
const VESTED_FETCH_TIMEOUT_MS = Number(
  process.env.VESTED_FETCH_TIMEOUT_MS || 8000
);
const SOLANA_STREAMFLOW_TIMEOUT_MS = Number(
  process.env.SOLANA_STREAMFLOW_TIMEOUT_MS || 6000
);
const EXPLORER_BASE_URL =
  process.env.EXPLORER_BASE_URL || 'https://sepolia.etherscan.io';
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_BYPASS = process.env.TURNSTILE_BYPASS === 'true';
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 60 * 24 * 3);
const NONCE_TTL_MINUTES = Number(process.env.NONCE_TTL_MINUTES || 10);
const NONCE_MAX_AGE_MS = Number(
  process.env.NONCE_MAX_AGE_MS || NONCE_TTL_MINUTES * 60 * 1000
);
const GEO_LOOKUP_URL = process.env.GEO_LOOKUP_URL || 'https://ipapi.co';
const GEO_LOOKUP_TIMEOUT_MS = Number(process.env.GEO_LOOKUP_TIMEOUT_MS || 2200);
const GEO_CACHE_TTL_MS = Number(process.env.GEO_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const GEO_CACHE_MAX_ITEMS = Number(process.env.GEO_CACHE_MAX_ITEMS || 50000);
const BLOCK_CACHE_MAX_ITEMS = Number(process.env.BLOCK_CACHE_MAX_ITEMS || 5000);
const REPAY_CACHE_TTL_MS = Number(process.env.REPAY_CACHE_TTL_MS || 30000);
const RPC_CONCURRENCY_LIMIT = Math.max(1, Number(process.env.RPC_CONCURRENCY_LIMIT || 6));
const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || '').trim();
// Insider-aware LTV cap when wallet+token is flagged (bps). See docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md
const INSIDER_LTV_BPS = Math.min(10000, Math.max(0, Number(process.env.INSIDER_LTV_BPS || 1500)));
const CONCENTRATION_MAX_USD_PER_TOKEN = process.env.CONCENTRATION_MAX_USD_PER_TOKEN
  ? Number(process.env.CONCENTRATION_MAX_USD_PER_TOKEN)
  : null;
const MIN_INTEREST_BPS = process.env.MIN_INTEREST_BPS ? Number(process.env.MIN_INTEREST_BPS) : null;
const ONE_DAY = 24 * 60 * 60;
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Always-on keepers (optional; disabled by default)
const EVM_KEEPER_ENABLED = process.env.EVM_KEEPER_ENABLED === 'true';
const EVM_KEEPER_PRIVATE_KEY = String(process.env.EVM_KEEPER_PRIVATE_KEY || '').trim();
const EVM_KEEPER_INTERVAL_MS = Number(process.env.EVM_KEEPER_INTERVAL_MS || 60000);
const EVM_KEEPER_MAX_TX_PER_TICK = Math.max(1, Number(process.env.EVM_KEEPER_MAX_TX_PER_TICK || 4));
const EVM_KEEPER_RECENT_SCAN = Math.max(0, Number(process.env.EVM_KEEPER_RECENT_SCAN || 200));
const EVM_KEEPER_ROTATING_SCAN = Math.max(0, Number(process.env.EVM_KEEPER_ROTATING_SCAN || 200));

const EVM_REPAY_KEEPER_ENABLED = process.env.EVM_REPAY_KEEPER_ENABLED === 'true';
const EVM_REPAY_KEEPER_INTERVAL_MS = Number(process.env.EVM_REPAY_KEEPER_INTERVAL_MS || 60000);
const EVM_REPAY_KEEPER_MAX_TX_PER_TICK = Math.max(1, Number(process.env.EVM_REPAY_KEEPER_MAX_TX_PER_TICK || 2));
const EVM_REPAY_KEEPER_LOOKAHEAD_SECONDS = Math.max(
  0,
  Number(process.env.EVM_REPAY_KEEPER_LOOKAHEAD_SECONDS || 3 * 24 * 60 * 60)
);
const EVM_REPAY_KEEPER_MAX_TOKENS_PER_LOAN = Math.max(
  1,
  Number(process.env.EVM_REPAY_KEEPER_MAX_TOKENS_PER_LOAN || 5)
);

const SOLANA_REPAY_JOBS_ENABLED = process.env.SOLANA_REPAY_JOBS_ENABLED === 'true';
const SOLANA_REPAY_JOBS_INTERVAL_MS = Number(process.env.SOLANA_REPAY_JOBS_INTERVAL_MS || 30000);
const SOLANA_REPAY_JOBS_MAX_PER_TICK = Math.max(1, Number(process.env.SOLANA_REPAY_JOBS_MAX_PER_TICK || 4));

let provider;
try {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  console.log(`[EVM] Connected to RPC: ${RPC_URL}`);
} catch (err) {
  console.warn(`[EVM] Failed to initialize provider with ${RPC_URL}: ${err.message}`);
  // Fallback or retry logic could go here if needed
}
const agent = initAgent();
const blockCache = new Map();
const activityEvents = [];
const seenEvents = new Set();
let lastIndexedBlock = 0;
let latestChainBlock = 0;
let lastPollAt = 0;
let pollInFlight = false;

// Real-time Simulation State (Guided by MeTTa/Omega Agent)
let simulationState = {
  volatility: 10,
  interestRateBps: 800,
  lastUpdate: Date.now()
};

let relayerService;
let loanExecutionService;
let lendingService;
let indexerService;
let omegaService;
let airdropService;
let snapshotInFlight = false;
let cachedRepaySchedule = [];
let lastScheduleRefresh = 0;
const vestedSnapshots = [];
let cachedVestedContracts = [];
let cachedVestedContractsAt = 0;
const geoLookupCache = new Map();
let vestedContractsInFlight = null;
let repayScheduleInFlight = null;
let evmKeeperInFlight = false;
let evmRepayKeeperInFlight = false;
let solanaRepayJobsInFlight = false;

const repayScheduleCache = {
  items: [],
  at: 0
};

// Faucet request lock (per-address)
const faucetLock = new Map();
const FAUCET_LOCK_TTL_MS = 60_000; // 1 minute lock

const withTimeout = (promise, ms, fallback) =>
  Promise.race([
    promise,
    new Promise((resolve) =>
      setTimeout(() => resolve(fallback), Math.max(0, ms))
    )
  ]);

const withTimeoutReject = (promise, ms, label = 'operation') =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        Math.max(0, ms)
      )
    )
  ]);

const trimMapToLimit = (map, maxItems) => {
  if (!(map instanceof Map) || !Number.isFinite(maxItems) || maxItems <= 0) return;
  while (map.size > maxItems) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
};

const sanitizeForJson = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? item.toString() : item
    )
  );

const loadPersistedEvents = async () => {
  const rows = await persistence.loadEvents(INDEXER_MAX_EVENTS);
  rows.forEach((row) => {
    activityEvents.push(row);
    seenEvents.add(`${row.txHash}-${row.logIndex}`);
  });
};

const loadPersistedSnapshots = async () => {
  const rows = await persistence.loadSnapshots(INDEXER_SNAPSHOT_LIMIT);
  rows.forEach((row) => vestedSnapshots.push(row));
};

const initPersistence = async () => {
  await persistence.init();
  let chainId = null;
  try {
    const net = await provider.getNetwork();
    chainId = net?.chainId != null ? String(net.chainId) : null;
  } catch (_) {
    chainId = null;
  }

  const persistedChainId = await persistence.getMeta('indexerChainId');
  const chainMatches = chainId && persistedChainId && String(chainId) === String(persistedChainId);

  if (!chainMatches) {
    // Switching networks (localhost ↔ sepolia) should not reuse cached indexer state.
    // Clear cache so we start from latest - lookback and avoid huge backfills.
    await persistence.clearIndexerCache();
    if (chainId) await persistence.setMeta('indexerChainId', chainId);
    lastIndexedBlock = null;
    activityEvents.length = 0;
    vestedSnapshots.length = 0;
    seenEvents.clear();
    return;
  }

  const persistedLastIndexed = await persistence.getMeta('lastIndexedBlock');
  if (persistedLastIndexed !== null) {
    lastIndexedBlock = Number(persistedLastIndexed);
  }
  await loadPersistedEvents();
  await loadPersistedSnapshots();
};

const DEPLOYMENTS_NETWORK = process.env.DEPLOYMENTS_NETWORK || 'sepolia';

const loadDeployment = (name) => {
  try {
    const filePath = path.join(
      __dirname,
      '..',
      'deployments',
      DEPLOYMENTS_NETWORK,
      `${name}.json`
    );
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (DEPLOYMENTS_NETWORK === 'localhost') {
      console.warn(`[backend] Missing deployment for ${name} on localhost, using dummy data`);
      return { address: ethers.ZeroAddress, abi: [] };
    }
    throw err;
  }
};

const loanManagerDeployment = loadDeployment('LoanManager');
const loanManager = {
  address: loanManagerDeployment.address,
  iface: new ethers.Interface(loanManagerDeployment.abi)
};

const lendingPoolDeployment = loadDeployment('LendingPool');
const lendingPool = {
  address: lendingPoolDeployment.address,
  iface: new ethers.Interface(lendingPoolDeployment.abi)
};

const vestingAdapterDeployment = loadDeployment('VestingAdapter');
const vestingAdapter = {
  address: vestingAdapterDeployment.address,
  iface: new ethers.Interface(vestingAdapterDeployment.abi)
};

const valuationDeployment = loadDeployment('ValuationEngine');
const valuationEngine = {
  address: valuationDeployment.address,
  iface: new ethers.Interface(valuationDeployment.abi)
};

const loanNFTDeployment = loadDeployment('LoanNFT');
const loanNFT = {
  address: loanNFTDeployment.address,
  iface: new ethers.Interface(loanNFTDeployment.abi)
};

const openClawLighthouseDeployment = loadDeployment('OpenClawLighthouse');
const openClawLighthouse = {
  address: openClawLighthouseDeployment.address,
  iface: new ethers.Interface(openClawLighthouseDeployment.abi)
};

const globalRiskModuleDeployment = loadDeployment('GlobalRiskModule');
const globalRiskModule = {
  address: globalRiskModuleDeployment.address,
  iface: new ethers.Interface(globalRiskModuleDeployment.abi)
};

const vestingRegistryDeployment = loadDeployment('VestingRegistry');
const vestingRegistry = {
  address: vestingRegistryDeployment.address,
  iface: new ethers.Interface(vestingRegistryDeployment.abi)
};

// Blockchain indexing and risk management are now handled by IndexerService and OmegaService.



const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
const allowWildcardOrigin = corsOrigins.includes('*');
const corsOptions = allowWildcardOrigin
  ? { origin: true, credentials: false }
  : corsOrigins.length
    ? { origin: corsOrigins, credentials: true }
    : isProduction
      ? { origin: false, credentials: false }
      : { origin: true, credentials: true };
if (isProduction && !corsOrigins.length) {
  console.warn('[security] CORS_ORIGINS missing in production; cross-origin requests blocked');
}
app.use(helmet()); // Added helmet usage
app.use(cors(corsOptions));

// Security Headers (Hardening)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
  next();
});

const jsonLimit = process.env.JSON_BODY_LIMIT || '200kb';
app.use(express.json({ limit: jsonLimit }));

const stableStringify = (value) => JSON.stringify(sortKeysDeep(value));


const isAdminWallet = (walletAddress) => {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return false;
  const allowlist = String(process.env.ADMIN_WALLETS || '')
    .split(',')
    .map((item) => normalizeWalletAddress(item))
    .filter(Boolean);
  return allowlist.includes(normalized);
};

const requireAdmin = requireAdminFactory(ADMIN_API_KEY, isAdminWallet);
const requireSession = requireSessionFactory(persistence);
const requireWalletOwnerParam = (paramKey) => requireWalletOwnerParamFactory(paramKey, normalizeAnyWalletAddress);

const getCreditHistoryForWallet = (walletAddress) => {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) {
    return { repaidCount: 0, defaultedCount: 0 };
  }
  const repaidLoans = new Set();
  let defaultedCount = 0;

  for (const event of activityEvents) {
    const borrower = normalizeWalletAddress(event?.borrower || '');
    if (borrower !== normalized) continue;
    if (event.type === 'LoanRepaid' || event.type === 'LoanRepaidWithSwap') {
      repaidLoans.add(String(event.loanId || ''));
    }
    if (event.type === 'LoanSettled' && event.defaulted) {
      defaultedCount += 1;
    }
  }

  return {
    repaidCount: repaidLoans.size,
    defaultedCount
  };
};

const buildIdentityProfile = async (walletAddress) => {
  return SovereignDataService.refreshIdentityProfile(walletAddress);
};

const requireJsonBody = (req, res, next) => {
  if (req.method !== 'POST') return next();
  if (!req.is('application/json')) {
    return res.status(415).json({ ok: false, error: 'Expected JSON payload' });
  }
  if (!isPlainObject(req.body)) {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }
  return next();
};

const honeypotCheck = (req, res, next) => {
  if (req.body?.website) {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }
  return next();
};

const validateBody = (schema) => (req, res, next) => {
  // Zod generally returns `{ success: false }` for invalid payloads, but a malformed
  // schema (e.g. an undefined field in a z.object shape) can throw at parse-time.
  // This must never crash the request handler.
  try {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid payload',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      });
    }
    req.body = result.data;
    return next();
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid payload',
      details: [{ path: '', message: error?.message || 'Schema validation failed' }]
    });
  }
};









const verifyTurnstile = async (req, res, next) => {
  if (TURNSTILE_BYPASS) return next();
  if (!TURNSTILE_SECRET_KEY) {
    const isStrict = process.env.TURNSTILE_STRICT === 'true' || isProduction;
    if (!isStrict) {
      console.warn('[turnstile] bypassed: TURNSTILE_SECRET_KEY missing (non-strict mode)');
      return next();
    }
    return res.status(503).json({ ok: false, error: 'Security challenge not configured' });
  }
  const token = req.body?.captchaToken;
  if (!token) {
    return res.status(400).json({ ok: false, error: 'Captcha required' });
  }
  try {
    const body = new URLSearchParams();
    body.set('secret', TURNSTILE_SECRET_KEY);
    body.set('response', token);
    const ip = getClientIp(req);
    if (ip) body.set('remoteip', ip);
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body
      }
    );
    const data = await response.json();
    if (!data?.success) {
      return res.status(403).json({ ok: false, error: 'Captcha failed' });
    }
    if (req.body) {
      delete req.body.captchaToken;
    }
    return next();
  } catch (error) {
    console.error('[turnstile] verification error', error?.message || error);
    return res.status(502).json({ ok: false, error: 'Captcha unavailable' });
  }
};



const {
  defaultLimiter,
  strictLimiter,
  chatLimiter,
  expensiveLimiter,
  adminLimiter
} = createLimiters();

app.use(defaultLimiter);
app.use(requireJsonBody);
app.use(honeypotCheck);
app.use(attachSession(persistence));

// Expose expensiveLimiter for routers
app.set('expensiveLimiter', expensiveLimiter);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'vestra-backend',
    uptimeSec: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    persistence: persistence.useSupabase ? 'supabase' : 'sqlite',
    indexer: {
      enabled: INDEXER_ENABLED,
      lastIndexedBlock,
      latestChainBlock,
      lastPollAt
    }
  });
});

app.get('/api/simulation/state', (req, res) => {
  res.json({
    ok: true,
    ...omegaService.getSimulationState()
  });
});

app.post('/api/simulation/update', requireAdmin, (req, res) => {
  const { volatility, interestRateBps } = req.body;
  const state = omegaService.updateSimulation(volatility, interestRateBps);
  res.json({ ok: true, state });
});

app.get('/api/omega/health', async (req, res) => {
  const health = omegaService.getOmegaHealth();
  const treasury = await relayerService.getTreasuryHealth();
  res.json({ ok: true, ...health, treasury });
});

app.get('/api/omega/alerts', (req, res) => {
  res.json({
    ok: true,
    alerts: omegaService.omegaWatcher.alerts || []
  });
});


app.get('/api/loan/:id/health', async (req, res) => {
  const { id } = req.params;
  const healthFactor = omegaService.evaluateLoanHealth(id);
  if (healthFactor === null) {
    return res.status(404).json({ ok: false, error: 'Loan not tracked by sentinel' });
  }

  res.json({
    ok: true,
    loanId: id,
    healthFactor,
    status: healthFactor <= 1.0 ? 'LIQUIDATABLE' : healthFactor < 1.15 ? 'WARNING' : 'HEALTHY',
    metrics: {
      principal: loan.principal,
      collateralValueUsd: loan.collateralValueUsd
    }
  });
});

const { getPriceBehavior } = require('./lib/priceBehavior');

app.get('/api/price-behavior', async (req, res) => {
  const symbol = (req.query.symbol || req.query.token || '').toString().trim().toUpperCase();
  const chainId = req.query.chainId != null ? Number(req.query.chainId) : undefined;
  if (!symbol) {
    return res.status(400).json({ ok: false, error: 'Missing symbol or token query' });
  }
  try {
    const data = await getPriceBehavior(symbol, chainId);
    return res.json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Price behavior unavailable'
    });
  }
});

app.get('/api/platform/snapshot', async (_req, res) => {
  console.log('[router] GET /api/platform/snapshot');
  try {
    const snapshot = await getPlatformSnapshot();
    return res.json({ ok: true, ...snapshot });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Platform snapshot unavailable'
    });
  }
});

app.post('/api/identity/verify', async (req, res) => {
  const { walletAddress } = req.body;
  const normalized = normalizeAnyWalletAddress(walletAddress || '');
  if (!normalized) {
    return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
  }

  try {
    console.log(`[identity] Triggering manual Gitcoin Passport sync for ${normalized}`);
    
    // Fetch score and stamps in parallel
    const [scoreResult, stampsResult] = await Promise.all([
      SovereignDataService.fetchGitcoinPassportScore(normalized),
      SovereignDataService.fetchGitcoinPassportStamps(normalized)
    ]);

    // Upsert to persistence
    await persistence.upsertIdentityAttestation({
      walletAddress: normalized,
      provider: 'GitcoinPassport',
      score: scoreResult?.score || 0,
      stampsCount: stampsResult?.stamps?.length || 0,
      metadata: JSON.stringify({
        status: scoreResult?.status,
        last_score_timestamp: scoreResult?.last_score_timestamp,
        stamps: stampsResult?.stamps
      })
    });

    const profile = await buildIdentityProfile(normalized);
    return res.json({ ok: true, profile });
  } catch (error) {
    console.error('[identity] Verification failed:', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/identity/:walletAddress', async (req, res) => {
  const walletAddress = normalizeAnyWalletAddress(req.params.walletAddress || '');
  if (!walletAddress) {
    return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
  }
  try {
    const chainType = detectChainTypeForWallet(walletAddress);
    const evmLinkedWallet =
      chainType === 'solana'
        ? await persistence.getLinkedEvmWallet({ chainType, walletAddress })
        : '';
    const identityWallet = evmLinkedWallet || walletAddress;
    const profile = await buildIdentityProfile(identityWallet);
    if (!profile) {
      return res.status(404).json({ ok: false, error: 'Identity profile unavailable' });
    }
    if (identityWallet !== walletAddress) {
      profile.requestedWalletAddress = walletAddress;
      profile.resolvedWalletAddress = identityWallet;
    }
    const result = {
      ...profile,
      mock: true,
      environment: 'testnet'
    };
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      mock: true,
      environment: 'testnet',
      error: error?.message || 'Failed to build identity profile'
    });
  }
});

// Faucet for Testnet USDC (Dev ONLY)
app.post('/api/faucet/usdc', expensiveLimiter, async (req, res) => {
  try {
    const { address } = req.body;
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ ok: false, error: 'Valid EVM address required' });
    }

    // Per-address Mutex
    const normalized = address.toLowerCase();
    const lockedAt = faucetLock.get(normalized);
    if (lockedAt && Date.now() - lockedAt < FAUCET_LOCK_TTL_MS) {
        return res.status(429).json({ 
            ok: false, 
            error: 'Faucet request for this address is already in progress. Please wait 1 minute.' 
        });
    }
    faucetLock.set(normalized, Date.now());


    const usdcAddress = process.env.NEXT_USDC_ADDRESS || '0x3dF11e82a5aBe55DE936418Cf89373FDAE1579C8';
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const usdcContract = new ethers.Contract(usdcAddress, [
      'function mint(address to, uint256 amount)',
      'function transfer(address to, uint256 amount)'
    ], provider);

    // Try to mint if the contract supports it, otherwise transfer from relayer (if it has funds)
    try {
      const relayerBase = getRelayerWallet();
      const relayer = relayerBase.connect(provider); // ENFORCE Sepolia provider for faucet
      console.log(`[faucet] Attempting mint for ${address} using relayer ${relayer.address} on Sepolia`);
      
      const connectedUsdc = usdcContract.connect(relayer);
      const tx = await connectedUsdc.mint(address, ethers.parseUnits('1000', 6));
      await tx.wait();
      console.log(`[faucet] Mint success: ${tx.hash}`);
      res.json({ ok: true, amount: 1000, txHash: tx.hash });
    } catch (mintErr) {
      console.warn('[faucet] mint failed:', mintErr.message);
      if (mintErr.data) console.warn('[faucet] mint error data:', mintErr.data);
      
      try {
        const relayerBase = getRelayerWallet();
        const relayer = relayerBase.connect(provider);
        const connectedUsdc = usdcContract.connect(relayer);
        console.log(`[faucet] Attempting transfer for ${address} from relayer ${relayer.address}`);
        const tx = await connectedUsdc.transfer(address, ethers.parseUnits('1000', 6));
        await tx.wait();
        console.log(`[faucet] Transfer success: ${tx.hash}`);
        res.json({ ok: true, amount: 1000, txHash: tx.hash });
      } catch (transferErr) {
        console.error('[faucet] Transfer failed:', transferErr.message);
        if (transferErr.data) console.error('[faucet] transfer error data:', transferErr.data);
        res.status(500).json({ ok: false, error: 'Faucet depleted or minting not allowed. ' + transferErr.message });
      }
    }
  } catch (err) {
    console.error('[faucet] Internal Error:', err.stack || err.message);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
      // Release lock after small delay to protect against immediate retries
      setTimeout(() => {
          const { address } = req.body;
          if (address) faucetLock.delete(address.toLowerCase());
      }, 5000);
  }
});

// Community Lending Pools

app.get('/api/loans', async (req, res) => {
  try {
    const wallet = normalizeAnyWalletAddress(req.query.wallet || '');
    if (!wallet) return res.status(400).json({ ok: false, error: 'wallet required' });
    const loans = await persistence.getLoansByWallet(wallet);
    res.json({ ok: true, items: loans });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/lend/positions', async (req, res) => {
  const wallet = normalizeAnyWalletAddress(req.query.wallet || '');
  if (!wallet) {
    return res.status(400).json({ ok: false, error: 'Missing wallet query' });
  }
  try {
    const positions = await persistence.listLendingPositions(wallet);
    return res.json({ ok: true, positions });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/lend', async (req, res) => {
  try {
    const wallet = normalizeAnyWalletAddress(req.query.wallet || '');
    if (!wallet) return res.status(400).json({ ok: false, error: 'wallet required' });
    
    // Fetch persisted data as fallback or for metadata
    const persisted = await persistence.getDepositsByWallet(wallet);
    
    // Fetch real-time enriched data from LendingService
    const dashboard = await lendingService.getLenderDashboard(wallet, persisted);
    
    res.json({ ok: true, data: dashboard, persisted });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/lender/projections', async (req, res) => {
  try {
    const { amount, apyBps } = req.query;
    if (!amount || !apyBps) return res.status(400).json({ ok: false, error: 'missing params' });
    
    const result = await lendingService.getProjections(amount, apyBps);
    res.json({ ok: true, projections: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const computeLoanTerms = (identityTier, score) => {
  // Base APR (Anonymous - Tier 0) starts at 2200 bps (22%)
  // Base LTV (Anonymous - Tier 0) starts at 2000 bps (20%)
  let aprBps = 2200;
  let ltvBps = 2000;

  if (identityTier >= 5) { // Institutional
    aprBps = 450; // 4.5%
    ltvBps = 9000; // 90%
  } else if (identityTier === 4) { // Trusted (KYC+)
    aprBps = 650; // 6.5%
    ltvBps = 8000; // 80%
  } else if (identityTier === 3) { // Verified (Stamps/Score)
    aprBps = 950; // 9.5%
    ltvBps = 7000; // 70%
  } else if (identityTier === 2) { // Standard (Score)
    aprBps = 1400; // 14%
    ltvBps = 5500; // 55%
  } else if (identityTier === 1) { // Basic
    aprBps = 1800; // 18%
    ltvBps = 3500; // 35%
  }

  // Score bonus: reduce APR by up to 200 bps for high score within tier
  const scoreBonus = Math.floor((score / 1000) * 200);
  aprBps -= scoreBonus;

  return { aprBps, ltvBps };
};

app.post('/api/loans/simulate', async (req, res) => {
  try {
    const wallet = normalizeAnyWalletAddress(req.body.wallet || '');
    const { amount, collateralId } = req.body;
    if (!wallet) return res.status(400).json({ ok: false, error: 'wallet required' });

    const profile = await buildIdentityProfile(wallet);
    const { aprBps, ltvBps } = computeLoanTerms(profile.identityTier, profile.compositeScore);

    res.json({
      ok: true,
      simulation: {
        principal: amount,
        ltvBps,
        aprBps,
        tier: profile.tierName,
        score: profile.compositeScore
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/loans/originate', async (req, res) => {
  try {
    const wallet = normalizeAnyWalletAddress(req.body.wallet || '');
    const { amount, ltvBps, aprBps, collateralItems } = req.body;
    if (!wallet || !amount) return res.status(400).json({ ok: false, error: 'missing fields' });

    const loanId = await persistence.createLoan({
      walletAddress: wallet,
      amount,
      ltvBps,
      aprBps,
      duration_days: req.body.duration_days || 30,
      collateralItems
    });

    res.json({ ok: true, loanId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/lend/deposit', async (req, res) => {
  try {
    const wallet = normalizeAnyWalletAddress(req.body.wallet || '');
    const { amount, apyBps, durationDays } = req.body;
    if (!wallet || !amount) return res.status(400).json({ ok: false, error: 'missing fields' });

    const depositId = await persistence.createDeposit({
      walletAddress: wallet,
      amount,
      apyBps,
      durationDays
    });

    res.json({ ok: true, depositId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// V16.0 Incentivized Testnet Points & Leaderboard
app.get('/api/testnet/points/:wallet', async (req, res) => {
  const wallet = normalizeAnyWalletAddress(req.params.wallet || '');
  if (!wallet) return res.status(400).json({ ok: false, error: 'Invalid wallet' });
  try {
    const points = await airdropService.getWalletPoints(wallet);
    res.json({ ok: true, data: points });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/testnet/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const board = await persistence.getLeaderboard(limit);
    res.json({ ok: true, data: board });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/loans/prepare', async (req, res) => {
  try {
    const wallet = normalizeAnyWalletAddress(req.body.wallet || '');
    if (!wallet) return res.status(400).json({ ok: false, error: 'missing wallet' });
    
    const result = await loanExecutionService.prepareLoanExecution(wallet);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/loans/finalize', async (req, res) => {
  try {
    const wallet = normalizeAnyWalletAddress(req.body.wallet || '');
    const { txHash } = req.body;
    if (!wallet || !txHash) return res.status(400).json({ ok: false, error: 'missing fields' });

    const result = await loanExecutionService.finalizeLoan(wallet, txHash);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get(
  '/api/identity/passport-score/:walletAddress',
  requireSession,
  requireWalletOwnerParam('walletAddress'),
  async (req, res) => {
    const walletAddress = normalizeAnyWalletAddress(req.params.walletAddress || '');
    if (!walletAddress) {
      return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
    }
    const targetChain = detectChainTypeForWallet(walletAddress);
    const sessionWallets = Array.isArray(req.user?.linkedWallets) ? req.user.linkedWallets : [];
    const linkedEvmWallet =
      targetChain === 'solana'
        ? await persistence.getLinkedEvmWallet({ chainType: 'solana', walletAddress })
        : '';
    const evmWalletForIdentity =
      (targetChain === 'evm' ? walletAddress : '') ||
      linkedEvmWallet ||
      normalizeWalletAddress(req.user?.walletAddress || '') ||
      normalizeWalletAddress(
        sessionWallets.find(
          (wallet) => String(wallet?.chainType || '').toLowerCase() === 'evm'
        )?.walletAddress || ''
      );
    const identityWallet = evmWalletForIdentity || walletAddress;
    try {
      const existing = await persistence.listIdentityAttestations(identityWallet);
      const existingPassport = existing.find(
        (item) => String(item?.provider || '').toLowerCase() === 'gitcoin_passport'
      );
      let attestationCreated = false;
      let score = 0;
      let stampsCount = 0;

      const liveScore = await SovereignDataService.fetchGitcoinPassportScore(identityWallet);
      const liveStamps = await SovereignDataService.fetchGitcoinPassportStamps(identityWallet);
      const stampsMetadata = await SovereignDataService.fetchGitcoinPassportMetadata();

      if (liveScore && liveScore.score !== undefined) {
        score = liveScore.score;
        stampsCount = Array.isArray(liveStamps) ? liveStamps.length : 0;
      } else {
        console.warn(`[server] Live Gitcoin fetch failed for ${identityWallet}, trying persistence.`);
        const existing = await persistence.listIdentityAttestations(identityWallet);
        const existingGP = existing.find(a => a.provider === 'gitcoin_passport');
        if (existingGP) {
            score = existingGP.score || 0;
            stampsCount = existingGP.stampsCount || 0;
        }
      }

      if (!existingPassport || (liveScore && liveScore.score !== undefined)) {
        await persistence.upsertIdentityAttestation({
          walletAddress: identityWallet,
          provider: 'gitcoin_passport',
          score,
          stampsCount,
          verifiedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 180 * ONE_DAY * 1000).toISOString(),
          metadata: {
            ...(liveScore || {}),
            stamps: liveStamps || [],
            source: liveScore ? 'Gitcoin' : 'failed_fetch'
          }
        });
        attestationCreated = true;
      }

      const currentProfile = await persistence.getIdentityProfileByWallet(identityWallet);
      await persistence.upsertIdentityProfile({
        walletAddress: identityWallet,
        linkedAt: currentProfile?.linkedAt || new Date().toISOString(),
        identityProofHash: currentProfile?.identityProofHash || `0x${digest.slice(0, 64)}`,
        sanctionsPass:
          currentProfile?.sanctionsPass === null || currentProfile?.sanctionsPass === undefined
            ? true
            : currentProfile.sanctionsPass
      });

      const profile = await buildIdentityProfile(identityWallet);
      return res.json({
        ok: true,
        environment: process.env.NODE_ENV || 'development',
        provider: 'gitcoin_passport',
        mock: false,
        score,
        stampsCount,
        stamps: liveStamps || [],
        stampsMetadata: stampsMetadata || {},
        attestationCreated,
        identityTier: profile.identityTier,
        tierName: profile.tierName,
        compositeScore: profile.compositeScore,
        ias: profile.ias,
        fbs: profile.fbs,
        policy: profile.policy
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Failed to score passport identity'
      });
    }
  }
);



const isValidSolanaPublicKey = (value) => {
  try {
    return Boolean(new PublicKey(String(value).trim()));
  } catch {
    return false;
  }
};





const getPoolInterestBps = async () => {
  let bps = 1800;
  try {
    const contract = new ethers.Contract(
      lendingPool.address,
      lendingPoolDeployment.abi,
      provider
    );
    const rate = await contract.getInterestRateBps();
    bps = Number(rate);
  } catch {
    bps = MIN_INTEREST_BPS != null && MIN_INTEREST_BPS > 0 ? MIN_INTEREST_BPS : 1800;
  }

  // Apply MeTTabrain dynamic adjustments based on simulation state (volatility/chaos)
  if (simulationState && simulationState.volatility > 10) {
    const dynamicApr = meTTabrain.calculateDynamicAPR({
      baseRateBps: bps,
      utilizationRatio: 0.65, // Mocked for MVP demo responsiveness
      volatilityIndex: Math.min(1.0, simulationState.volatility / 100),
      userCRDTScore: 750
    });
    // Convert percentage string back to BPS
    const oldBps = bps;
    bps = Math.round(parseFloat(dynamicApr) * 100);
    console.log(`[Ω OMEGA] Dynamic APR Adjustment: Volatility ${simulationState.volatility}%, BPS ${oldBps} -> ${bps}`);
  }

  if (MIN_INTEREST_BPS != null && MIN_INTEREST_BPS > 0 && bps < MIN_INTEREST_BPS) bps = MIN_INTEREST_BPS;
  return bps;
};



const getAvailableLiquidityUsd = async () => {
  try {
    const poolContract = new ethers.Contract(
      lendingPoolDeployment.address,
      ['function totalDeposits() view returns (uint256)', 'function totalBorrowed() view returns (uint256)'],
      provider
    );
    const [totalDeposits, totalBorrowed] = await Promise.all([
      poolContract.totalDeposits(),
      poolContract.totalBorrowed()
    ]);
    const deposits = BigInt(totalDeposits || 0n);
    const borrowed = BigInt(totalBorrowed || 0n);
    const available = deposits > borrowed ? deposits - borrowed : 0n;
    return toUsdFromUsdcUnits(available);
  } catch {
    return null;
  }
};

const getProtocolBorrowerStats = (walletAddress) => {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return null;
  let oldestTs = null;
  let totalBorrowedUsdcUnits = 0n;
  for (const event of activityEvents) {
    const borrower = normalizeWalletAddress(event?.borrower || '');
    if (borrower !== normalized) continue;
    const ts = Number(event?.timestamp || 0);
    if (Number.isFinite(ts) && ts > 0) {
      if (oldestTs === null || ts < oldestTs) oldestTs = ts;
    }
    if (event?.type === 'LoanCreated' && event?.amount) {
      try {
        totalBorrowedUsdcUnits += BigInt(event.amount);
      } catch {
        // ignore malformed amounts
      }
    }
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const walletAgeDays =
    oldestTs && Number.isFinite(oldestTs) && oldestTs > 0
      ? Math.max(0, Math.floor((nowSec - oldestTs) / ONE_DAY))
      : 0;
  return {
    walletAgeDays,
    volumeUsd: toUsdFromUsdcUnits(totalBorrowedUsdcUnits)
  };
};

const computeEvmDpv = async ({ quantity, token, unlockTime }) => {
  try {
    const contract = new ethers.Contract(
      valuationEngine.address,
      valuationDeployment.abi,
      provider
    );
    const pv = await contract.computeDPV(
      toBigIntSafe(quantity),
      token,
      Number(unlockTime)
    );
    const pvValue = pv?.[0] ?? 0n;
    const ltvValue = pv?.[1] ?? 0n;
    return {
      pv: toNumber(pvValue.toString(), 0),
      ltvBps: toNumber(ltvValue.toString(), 0)
    };
  } catch {
    return { pv: 0, ltvBps: 0 };
  }
};

const normalizePoolPreferences = (pool) => ({
  riskTier: pool?.preferences?.riskTier || 'balanced',
  maxLtvBps: pool?.preferences?.maxLtvBps,
  interestBps: pool?.preferences?.interestBps,
  minLiquidityUsd: pool?.preferences?.minLiquidityUsd,
  minWalletAgeDays: pool?.preferences?.minWalletAgeDays,
  minVolumeUsd: pool?.preferences?.minVolumeUsd,
  unlockWindowDays: pool?.preferences?.unlockWindowDays,
  tokenCategories: pool?.preferences?.tokenCategories || [],
  allowedTokens: pool?.preferences?.allowedTokens || [],
  allowedTokenTypes: pool?.preferences?.allowedTokenTypes || [],
  vestPreferences: pool?.preferences?.vestPreferences || null,
  chains: pool?.preferences?.chains || [],
  maxLoanUsd: pool?.preferences?.maxLoanUsd,
  minLoanUsd: pool?.preferences?.minLoanUsd,
  accessType: pool?.preferences?.accessType || 'open',
  premiumToken: pool?.preferences?.premiumToken || null,
  communityToken: pool?.preferences?.communityToken || null,
  description: pool?.preferences?.description || null
});

const COMMUNITY_POOL_STATE_LABELS = ['FUNDRAISING', 'ACTIVE', 'REFUNDING', 'CLOSED'];

const toCommunityPoolItem = (poolId, row, pendingRewards = null) => {
  const stateIndex = Number(row?.state ?? 0);
  const safeState = Number.isFinite(stateIndex) ? stateIndex : 0;
  return {
    poolId: Number(poolId),
    name: row?.name || '',
    creator: row?.creator || '',
    targetAmount: String(row?.targetAmount ?? '0'),
    maxAmount: String(row?.maxAmount ?? '0'),
    deadline: Number(row?.deadline ?? 0),
    totalContributed: String(row?.totalContributed ?? '0'),
    totalBuildingUnits: String(row?.totalBuildingUnits ?? '0'),
    participantCount: String(row?.participantCount ?? '0'),
    totalRewardFunded: String(row?.totalRewardFunded ?? '0'),
    rewardsByBuildingSize: Boolean(row?.rewardsByBuildingSize),
    state: safeState,
    stateLabel: COMMUNITY_POOL_STATE_LABELS[safeState] || 'UNKNOWN',
    pendingRewards: pendingRewards === null ? null : String(pendingRewards)
  };
};

const readCommunityPools = async ({ walletAddress = null, limit = 50 } = {}) => {
  const contract = new ethers.Contract(lendingPool.address, communityPoolReadAbi, provider);
  const totalCountRaw = await contract.communityPoolCount();
  const totalCount = Number(totalCountRaw || 0n);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const start = Math.max(0, totalCount - safeLimit);
  const ids = [];
  for (let i = totalCount - 1; i >= start; i -= 1) {
    ids.push(i);
  }
  const items = await mapWithConcurrency(
    ids,
    async (poolId) => {
      const row = await contract.communityPools(poolId);
      let pendingRewards = null;
      if (walletAddress && ethers.isAddress(walletAddress)) {
        try {
          pendingRewards = await contract.pendingCommunityPoolRewards(poolId, walletAddress);
        } catch {
          pendingRewards = null;
        }
      }
      return toCommunityPoolItem(poolId, row, pendingRewards);
    },
    Math.min(RPC_CONCURRENCY_LIMIT, 4)
  );
  return { totalCount, items };
};

const checkTokenBalance = async (wallet, tokenAddress) => {
  if (!wallet || !tokenAddress || !ethers.isAddress(tokenAddress)) return 0n;
  try {
    const contract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    return await contract.balanceOf(wallet);
  } catch {
    return 0n;
  }
};

const buildPoolOffers = async ({
  pools,
  desiredAmountUsd,
  pvUsd,
  ltvBps,
  chain,
  unlockTime,
  baseRateBps,
  borrowerWallet,
  collateralToken,
  tokenType,
  tokenCategory,
  liquidityUsd,
  borrowerStats,
  maxOffers
}) => {
  const daysToUnlock = getDaysToUnlock(unlockTime);
  const results = [];
  for (const pool of pools) {
    const prefs = normalizePoolPreferences(pool);
    if (prefs.chains.length && !prefs.chains.includes(chain)) continue;
    const maxLtv = prefs.maxLtvBps || ltvBps;
    const effectiveLtv = Math.min(maxLtv, ltvBps || maxLtv || 0);
    const valuationMaxBorrowUsd = pvUsd > 0 && effectiveLtv > 0 ? (pvUsd * effectiveLtv) / 10000 : 0;
    const policyMaxBorrowUsd =
      prefs.maxLoanUsd && Number.isFinite(prefs.maxLoanUsd) && prefs.maxLoanUsd > 0
        ? Math.min(valuationMaxBorrowUsd, prefs.maxLoanUsd)
        : valuationMaxBorrowUsd;
    // If the pool has a minimum, but even the max borrow can't meet it, skip entirely.
    if (prefs.minLoanUsd && policyMaxBorrowUsd > 0 && policyMaxBorrowUsd < prefs.minLoanUsd) continue;
    // Return offers even when they can't fill the requested amount; UI can downsize.
    if (policyMaxBorrowUsd <= 0) continue;
    if (prefs.unlockWindowDays?.min && daysToUnlock !== null && daysToUnlock < prefs.unlockWindowDays.min) {
      continue;
    }
    if (prefs.unlockWindowDays?.max && daysToUnlock !== null && daysToUnlock > prefs.unlockWindowDays.max) {
      continue;
    }

    // Collateral allowlists (offchain preference enforcement).
    if (prefs.allowedTokens?.length) {
      if (!collateralToken) {
        // Can't validate allowlist without a resolved token/mint.
        continue;
      }
      const allowed = prefs.allowedTokens
        .map((t) => String(t || '').trim().toLowerCase())
        .filter(Boolean);
      const tokenLower = String(collateralToken).trim().toLowerCase();
      if (allowed.length && !allowed.includes(tokenLower)) continue;
    }
    if (prefs.allowedTokenTypes?.length && tokenType) {
      const allowedTypes = prefs.allowedTokenTypes
        .map((t) => String(t || '').trim().toLowerCase())
        .filter(Boolean);
      const typeLower = String(tokenType).trim().toLowerCase();
      if (allowedTypes.length && !allowedTypes.includes(typeLower)) continue;
    }
    if (prefs.tokenCategories?.length && tokenCategory) {
      const allowedCategories = prefs.tokenCategories
        .map((t) => String(t || '').trim().toLowerCase())
        .filter(Boolean);
      const categoryLower = String(tokenCategory).trim().toLowerCase();
      if (allowedCategories.length && !allowedCategories.includes(categoryLower)) continue;
    }

    // Liquidity / identity preferences (best-effort enforcement).
    if (prefs.minLiquidityUsd != null && prefs.minLiquidityUsd > 0) {
      if (liquidityUsd != null && Number.isFinite(Number(liquidityUsd))) {
        if (Number(liquidityUsd) < Number(prefs.minLiquidityUsd)) continue;
      }
    }
    if (prefs.minWalletAgeDays != null && prefs.minWalletAgeDays > 0) {
      if (borrowerStats && Number(borrowerStats.walletAgeDays || 0) < Number(prefs.minWalletAgeDays)) {
        continue;
      }
    }
    if (prefs.minVolumeUsd != null && prefs.minVolumeUsd > 0) {
      if (borrowerStats && Number(borrowerStats.volumeUsd || 0) < Number(prefs.minVolumeUsd)) {
        continue;
      }
    }
    let canAccess = true;
    let lockReason = null;
    const accessType = prefs.accessType || 'open';
    if (accessType === 'premium' && prefs.premiumToken) {
      const bal = await checkTokenBalance(borrowerWallet, prefs.premiumToken);
      canAccess = bal > 0n;
      if (!canAccess) lockReason = 'Requires premium token to access';
    } else if (accessType === 'community' && prefs.communityToken) {
      const bal = await checkTokenBalance(borrowerWallet, prefs.communityToken);
      canAccess = bal > 0n;
      if (!canAccess) lockReason = 'Requires community token to borrow from this pool';
    }
    let interestBps = prefs.interestBps ?? baseRateBps;
    if (MIN_INTEREST_BPS != null && MIN_INTEREST_BPS > 0 && (interestBps == null || interestBps < MIN_INTEREST_BPS)) {
      interestBps = MIN_INTEREST_BPS;
    }
    const scoreBase = prefs.riskTier === 'aggressive' ? 85 : prefs.riskTier === 'conservative' ? 70 : 80;
    const ltvScore = ltvBps ? Math.min(15, Math.round((effectiveLtv / ltvBps) * 15)) : 0;
    const score = scoreBase + ltvScore;
    const warnings = [];
    if (prefs.minLiquidityUsd && (liquidityUsd === null || liquidityUsd === undefined)) {
      warnings.push('minLiquidityUsd could not be verified (RPC unavailable)');
    }
    if (prefs.minWalletAgeDays && !borrowerStats) warnings.push('wallet age could not be verified (no borrower wallet)');
    if (prefs.minVolumeUsd && !borrowerStats) warnings.push('volume could not be verified (no borrower wallet)');
    if (prefs.allowedTokenTypes?.length && !tokenType) warnings.push('allowedTokenTypes not evaluated (tokenType missing)');
    if (prefs.tokenCategories?.length && !tokenCategory) warnings.push('tokenCategories not evaluated (tokenCategory missing)');
    if (prefs.allowedTokens?.length) warnings.push('allowedTokens enforced offchain only (MVP)');
    if (prefs.minLoanUsd && desiredAmountUsd < prefs.minLoanUsd) {
      warnings.push(`Requested amount below pool minimum (${prefs.minLoanUsd} USD)`);
    }
    if (prefs.maxLoanUsd && desiredAmountUsd > prefs.maxLoanUsd) {
      warnings.push(`Requested amount above pool maximum (${prefs.maxLoanUsd} USD)`);
    }
    results.push({
      offerId: `${pool.id}:${chain}:${Date.now()}`,
      poolId: pool.id,
      ownerWallet: pool.ownerWallet,
      chain,
      riskTier: prefs.riskTier,
      interestBps,
      requestedAmountUsd: desiredAmountUsd,
      maxBorrowUsd: policyMaxBorrowUsd,
      canFillRequested:
        desiredAmountUsd > 0 &&
        desiredAmountUsd <= policyMaxBorrowUsd &&
        (!prefs.minLoanUsd || desiredAmountUsd >= prefs.minLoanUsd),
      score,
      warnings,
      accessType,
      canAccess,
      lockReason,
      poolName: pool.name
    });
  }
  const safeMax = Math.max(1, Math.min(Number(maxOffers) || 5, 10));
  return results.sort((a, b) => b.score - a.score).slice(0, safeMax);
};

app.post('/api/auth/nonce', validateBody(walletNonceSchema), async (req, res) => {
  try {
    if (!ethers.isAddress(req.body.walletAddress)) {
      return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
    }
    const walletAddress = ethers.getAddress(req.body.walletAddress);
    const user = await persistence.getOrCreateUserByWallet(walletAddress);
    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = new Date();
    const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000);
    const ipHash = hashIp(getClientIp(req));
    await persistence.clearSessionsByProvider(user.id, 'wallet_nonce');
    await persistence.createSession({
      userId: user.id,
      provider: 'wallet_nonce',
      nonce,
      issuedAt,
      expiresAt,
      ipHash
    });
    const issuedAtIso = issuedAt.toISOString();
    res.json({
      ok: true,
      walletAddress,
      nonce,
      message: buildWalletMessage(walletAddress, nonce, issuedAtIso),
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('[auth] nonce error', error?.message || error);
    res.status(500).json({ ok: false, error: 'Unable to issue nonce' });
  }
});

app.post('/api/auth/verify', validateBody(walletVerifySchema), async (req, res) => {
  try {
    if (!ethers.isAddress(req.body.walletAddress)) {
      return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
    }
    const walletAddress = ethers.getAddress(req.body.walletAddress);
    const user = await persistence.getOrCreateUserByWallet(walletAddress);
    const nonceSession = await persistence.getNonceSession(
      user.id,
      req.body.nonce
    );
    if (!nonceSession) {
      return res.status(401).json({ ok: false, error: 'Nonce expired' });
    }
    if (nonceSession.expiresAt && Date.now() > nonceSession.expiresAt) {
      return res.status(401).json({ ok: false, error: 'Nonce expired' });
    }
    const nonceIssuedAtMs = Date.parse(String(nonceSession.issuedAt || ''));
    if (!Number.isFinite(nonceIssuedAtMs)) {
      await persistence.deleteSession(nonceSession.id);
      return res.status(401).json({ ok: false, error: 'Nonce expired' });
    }
    if (Date.now() - nonceIssuedAtMs > NONCE_MAX_AGE_MS) {
      await persistence.deleteSession(nonceSession.id);
      return res.status(401).json({ ok: false, error: 'Nonce expired' });
    }
    const nonceIssuedAtIso = new Date(nonceIssuedAtMs).toISOString();
    const message = buildWalletMessage(walletAddress, req.body.nonce, nonceIssuedAtIso);
    const recovered = ethers.verifyMessage(message, req.body.signature);
    if (ethers.getAddress(recovered) !== walletAddress) {
      return res.status(401).json({ ok: false, error: 'Signature invalid' });
    }
    await persistence.deleteSession(nonceSession.id);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
    const ipHash = hashIp(getClientIp(req));
    await persistence.createSession({
      userId: user.id,
      provider: 'wallet_session',
      nonce: sessionToken,
      issuedAt: new Date(),
      expiresAt,
      ipHash
    });
    const linkedWallets = await persistence.listWalletLinksByUser(user.id);
    const clientIp = getClientIp(req);
    captureUserGeoPresence({ userId: user.id, ip: clientIp });
    res.json({
      ok: true,
      walletAddress,
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      linkedWallets
    });
  } catch (error) {
    console.error('[auth] verify error', error?.message || error);
    res.status(500).json({ ok: false, error: 'Unable to verify signature' });
  }
});

app.post('/api/auth/link-wallet', requireSession, validateBody(linkWalletSchema), async (req, res) => {
  try {
    const chainType = req.body.chainType === 'solana' ? 'solana' : 'evm';
    if (chainType === 'solana') {
      return res.status(409).json({
        ok: false,
        error: 'Solana linking now requires a signed proof. Use /api/auth/solana/nonce + /api/auth/solana/link-wallet.'
      });
    }
    const walletAddress =
      chainType === 'solana'
        ? normalizeSolanaAddress(req.body.walletAddress)
        : normalizeWalletAddress(req.body.walletAddress);
    if (!walletAddress) {
      return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
    }

    if (chainType === 'solana') {
      const signatureB64 = String(req.body.signature || '').trim();
      const issuedAtRaw = String(req.body.issuedAt || '').trim();
      const issuedAtMs = Date.parse(issuedAtRaw);
      if (!signatureB64 || !issuedAtRaw || !Number.isFinite(issuedAtMs)) {
        return res.status(400).json({ ok: false, error: 'Solana link requires signature + issuedAt' });
      }
      if (Math.abs(Date.now() - issuedAtMs) > 5 * 60 * 1000) {
        return res.status(400).json({ ok: false, error: 'Solana link signature expired' });
      }

      const token = getSessionToken(req);
      const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
      const message = [
        'Vestra wallet link request',
        `Wallet: ${walletAddress}`,
        `Issued at: ${new Date(issuedAtMs).toISOString()}`,
        `Session: ${tokenHash}`,
        'Only sign if you trust this request.'
      ].join('\n');
      const msgBytes = Buffer.from(message, 'utf8');
      let sigBytes;
      try {
        sigBytes = Buffer.from(signatureB64, 'base64');
      } catch {
        sigBytes = null;
      }
      if (!sigBytes || sigBytes.length < 64) {
        return res.status(400).json({ ok: false, error: 'Invalid Solana signature format' });
      }
      const pubBytes = new PublicKey(walletAddress).toBytes();
      const ok = nacl.sign.detached.verify(
        new Uint8Array(msgBytes),
        new Uint8Array(sigBytes),
        new Uint8Array(pubBytes)
      );
      if (!ok) {
        return res.status(403).json({ ok: false, error: 'Invalid Solana signature' });
      }
    }

    await persistence.linkWalletToUser({
      userId: req.user?.id,
      chainType,
      walletAddress
    });
    const linkedWallets = await persistence.listWalletLinksByUser(req.user?.id);
    return res.json({
      ok: true,
      linkedWallets
    });
  } catch (error) {
    const message = String(error?.message || 'Unable to link wallet');
    if (/already linked/i.test(message)) {
      return res.status(409).json({ ok: false, error: message });
    }
    return res.status(500).json({
      ok: false,
      error: message
    });
  }
});

app.post('/api/auth/solana/nonce', requireSession, validateBody(solanaNonceSchema), async (req, res) => {
  try {
    const walletAddress = normalizeSolanaAddress(req.body.walletAddress);
    if (!walletAddress) {
      return res.status(400).json({ ok: false, error: 'Invalid Solana wallet address' });
    }
    const issuedAtIso = new Date().toISOString();
    const nonce = crypto.randomBytes(16).toString('hex');
    await persistence.clearSessionsByProvider(req.user?.id, 'solana_wallet_nonce');
    const ttlMs = NONCE_TTL_MINUTES * 60 * 1000;
    await persistence.createSession({
      userId: req.user?.id,
      provider: 'solana_wallet_nonce',
      nonce,
      issuedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      ipHash: hashIp(getClientIp(req))
    });
    const message = buildSolanaLinkMessage(req.user?.id, walletAddress, nonce, issuedAtIso);
    return res.json({ ok: true, nonce, message, issuedAt: issuedAtIso });
  } catch (error) {
    console.error('[auth] solana nonce error', error?.message || error);
    return res.status(500).json({ ok: false, error: 'Unable to issue Solana nonce' });
  }
});

app.post('/api/auth/solana/link-wallet', requireSession, validateBody(solanaLinkWalletSchema), async (req, res) => {
  try {
    const walletAddress = normalizeSolanaAddress(req.body.walletAddress);
    if (!walletAddress) {
      return res.status(400).json({ ok: false, error: 'Invalid Solana wallet address' });
    }

    const nonceSession = await persistence.getNonceSessionByProvider(
      req.user?.id,
      'solana_wallet_nonce',
      req.body.nonce
    );
    if (!nonceSession) {
      return res.status(400).json({ ok: false, error: 'Invalid nonce' });
    }
    if (nonceSession.expiresAt && Date.now() > nonceSession.expiresAt) {
      await persistence.deleteSession(nonceSession.id);
      return res.status(400).json({ ok: false, error: 'Nonce expired' });
    }
    const nonceIssuedAtMs = Date.parse(String(nonceSession.issuedAt || ''));
    if (!Number.isFinite(nonceIssuedAtMs)) {
      await persistence.deleteSession(nonceSession.id);
      return res.status(400).json({ ok: false, error: 'Invalid nonce session' });
    }
    if (Date.now() - nonceIssuedAtMs > NONCE_MAX_AGE_MS) {
      await persistence.deleteSession(nonceSession.id);
      return res.status(400).json({ ok: false, error: 'Nonce expired' });
    }
    const nonceIssuedAtIso = new Date(nonceIssuedAtMs).toISOString();
    const message = buildSolanaLinkMessage(req.user?.id, walletAddress, req.body.nonce, nonceIssuedAtIso);
    const ok = verifySolanaDetachedSignature({
      walletAddress,
      message,
      signatureBase64: req.body.signature
    });
    if (!ok) {
      return res.status(403).json({ ok: false, error: 'Invalid Solana signature' });
    }
    await persistence.deleteSession(nonceSession.id);

    await persistence.linkWalletToUser({
      userId: req.user?.id,
      chainType: 'solana',
      walletAddress
    });
    const linkedWallets = await persistence.listWalletLinksByUser(req.user?.id);
    return res.json({ ok: true, linkedWallets });
  } catch (error) {
    const message = String(error?.message || 'Unable to link wallet');
    if (/already linked/i.test(message)) {
      return res.status(409).json({ ok: false, error: message });
    }
    return res.status(500).json({ ok: false, error: message });
  }
});

// --- Vestra Premium Privacy (Private Mode) ---

app.get('/api/privacy/solana/vault', requireSession, async (_req, res) => {
  try {
    const config = getRepayConfig();
    const vaultPubkey =
      String(process.env.SOLANA_PRIVACY_VAULT_PUBKEY || '').trim() ||
      String(config?.authorityPubkey || '').trim();
    return res.json({
      ok: true,
      vaultPubkey: vaultPubkey || null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Vault unavailable' });
  }
});

app.get('/api/privacy/evm/vault', requireSession, async (req, res) => {
  try {
    const existing = await persistence.getPrivacyVaultByUser(req.user?.id, 'evm');
    return res.json({
      ok: true,
      vaultAddress: existing?.vaultAddress || null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Unable to read vault' });
  }
});

app.post('/api/privacy/evm/register', strictLimiter, requireSession, async (req, res) => {
  try {
    const existing = await persistence.getPrivacyVaultByUser(req.user?.id, 'evm');
    if (existing?.vaultAddress) {
      return res.json({ ok: true, vaultAddress: existing.vaultAddress, existing: true });
    }
    const deployed = await deployVestraVault();
    await persistence.upsertPrivacyVault({
      userId: req.user?.id,
      chainType: 'evm',
      vaultAddress: deployed.vaultAddress
    });
    return res.json({
      ok: true,
      vaultAddress: deployed.vaultAddress,
      deployTxHash: deployed.deployTxHash,
      relayerAddress: deployed.relayerAddress
    });
  } catch (error) {
    console.error('[privacy] evm register failed', error?.message || error);
    return res.status(500).json({ ok: false, error: error?.message || 'Unable to register vault' });
  }
});

app.post(
  '/api/relayer/evm/create-private-loan',
  strictLimiter,
  requireSession,
  validateBody(privateLoanCreateSchema),
  async (req, res) => {
    try {
      const existing = await persistence.getPrivacyVaultByUser(req.user?.id, 'evm');
      if (!existing?.vaultAddress) {
        return res.status(409).json({ ok: false, error: 'No vault registered. Run Privacy Upgrade first.' });
      }
      await relayerService.verifyRelayerAuth({
        req,
        action: 'create-private-loan',
        payload: {
          collateralId: String(req.body.collateralId),
          vestingContract: String(req.body.vestingContract),
          borrowAmount: String(req.body.borrowAmount),
          collateralAmount: req.body.collateralAmount == null ? null : String(req.body.collateralAmount)
        },
        vaultAddress: existing.vaultAddress
      });
      if (!ethers.isAddress(req.body.vestingContract)) {
        return res.status(400).json({ ok: false, error: 'Invalid vesting contract address' });
      }
      const vestingContract = ethers.getAddress(req.body.vestingContract);
      const collateralId = BigInt(req.body.collateralId);
      const borrowAmount = BigInt(req.body.borrowAmount);
      const collateralAmountRaw = req.body.collateralAmount != null ? BigInt(req.body.collateralAmount) : null;

      // Encode LoanManager call, then route it through the user's vault.
      const fn =
        collateralAmountRaw && collateralAmountRaw > 0n
          ? 'createPrivateLoanWithCollateralAmount'
          : 'createPrivateLoan';
      const args =
        fn === 'createPrivateLoanWithCollateralAmount'
          ? [collateralId, vestingContract, borrowAmount, collateralAmountRaw]
          : [collateralId, vestingContract, borrowAmount];
      const data = loanManager.iface.encodeFunctionData(fn, args);

      const { txHash } = await execViaVault({
        vaultAddress: existing.vaultAddress,
        target: loanManager.address,
        value: 0n,
        data
      });

      return res.json({
        ok: true,
        vaultAddress: existing.vaultAddress,
        txHash
      });
    } catch (error) {
      console.error('[relayer] create-private-loan failed', error?.message || error);
      return res.status(500).json({ ok: false, error: error?.message || 'Relayer tx failed' });
    }
  }
);

app.post(
  '/api/relayer/evm/repay-private-loan',
  strictLimiter,
  requireSession,
  validateBody(privateLoanRepaySchema),
  async (req, res) => {
    try {
      const existing = await persistence.getPrivacyVaultByUser(req.user?.id, 'evm');
      if (!existing?.vaultAddress) {
        return res.status(409).json({ ok: false, error: 'No vault registered. Run Privacy Upgrade first.' });
      }
      await relayerService.verifyRelayerAuth({
        req,
        action: 'repay-private-loan',
        payload: { loanId: String(req.body.loanId), amount: String(req.body.amount) },
        vaultAddress: existing.vaultAddress
      });

      const loanId = BigInt(req.body.loanId);
      const amount = BigInt(req.body.amount);
      if (amount <= 0n) return res.status(400).json({ ok: false, error: 'Amount must be > 0' });

      const relayer = getRelayerWallet();
      const loanContract = new ethers.Contract(loanManager.address, loanManagerDeployment.abi, relayer);
      const isPrivate = await loanContract.isPrivateLoan(loanId);
      if (!isPrivate) {
        return res.status(409).json({ ok: false, error: 'Loan is not a private-mode loan.' });
      }

      // Ensure vault has allowance to let LoanManager pull USDC from the vault.
      let usdcAddress = '';
      try {
        usdcAddress = await loanContract.usdc();
      } catch (_) {
        usdcAddress = '';
      }
      if (!ethers.isAddress(usdcAddress)) {
        return res.status(500).json({ ok: false, error: 'Unable to resolve USDC address' });
      }

      const erc20Iface = new ethers.Interface([
        'function allowance(address owner,address spender) view returns (uint256)',
        'function approve(address spender,uint256 amount) returns (bool)'
      ]);
      const usdc = new ethers.Contract(usdcAddress, erc20Iface, relayer);
      const allowance = await usdc.allowance(existing.vaultAddress, loanManager.address);

      let approveTxHash = null;
      const MAX_UINT256 = (1n << 256n) - 1n;
      if (BigInt(allowance) < amount) {
        const approveData = erc20Iface.encodeFunctionData('approve', [loanManager.address, MAX_UINT256]);
        const approval = await execViaVault({
          vaultAddress: existing.vaultAddress,
          target: usdcAddress,
          value: 0n,
          data: approveData
        });
        approveTxHash = approval?.txHash || null;
      }

      const repayData = loanManager.iface.encodeFunctionData('repayPrivateLoan', [loanId, amount]);
      const { txHash } = await execViaVault({
        vaultAddress: existing.vaultAddress,
        target: loanManager.address,
        value: 0n,
        data: repayData
      });

      return res.json({
        ok: true,
        vaultAddress: existing.vaultAddress,
        approveTxHash,
        txHash
      });
    } catch (error) {
      console.error('[relayer] repay-private-loan failed', error?.message || error);
      return res.status(500).json({ ok: false, error: error?.message || 'Relayer tx failed' });
    }
  }
);

app.post(
  '/api/relayer/evm/settle-private-loan',
  strictLimiter,
  requireSession,
  validateBody(privateLoanSettleSchema),
  async (req, res) => {
    try {
      const loanId = BigInt(req.body.loanId);
      const existing = await persistence.getPrivacyVaultByUser(req.user?.id, 'evm');
      if (!existing?.vaultAddress) {
        return res.status(409).json({ ok: false, error: 'No vault registered. Run Privacy Upgrade first.' });
      }
      await relayerService.verifyRelayerAuth({
        req,
        action: 'settle-private-loan',
        payload: { loanId: String(req.body.loanId) },
        vaultAddress: existing.vaultAddress
      });
      const relayer = getRelayerWallet();
      const contract = new ethers.Contract(loanManager.address, loanManagerDeployment.abi, relayer);
      const isPrivate = await contract.isPrivateLoan(loanId);
      if (!isPrivate) {
        return res.status(409).json({ ok: false, error: 'Loan is not a private-mode loan.' });
      }
      const tx = await contract.settlePrivateAtUnlock(loanId);
      return res.json({ ok: true, txHash: tx.hash });
    } catch (error) {
      console.error('[relayer] settle-private-loan failed', error?.message || error);
      return res.status(500).json({ ok: false, error: error?.message || 'Relayer tx failed' });
    }
  }
);

// Deploy a Sablier v2 operator wrapper whose beneficiary is the user's private vault.
// This enables private-mode escrow even when the underlying stream recipient cannot be changed
// (privacy is "partial" because the stream still points to the old recipient onchain).
app.post(
  '/api/privacy/evm/wrappers/sablier/deploy',
  strictLimiter,
  requireSession,
  validateBody(sablierUpgradeSchema),
  async (req, res) => {
    try {
      const existing = await persistence.getPrivacyVaultByUser(req.user?.id, 'evm');
      if (!existing?.vaultAddress) {
        return res.status(409).json({ ok: false, error: 'No vault registered. Run Privacy Upgrade first.' });
      }
      const streamType = req.body.type || 'lockup'; // 'lockup' or 'flow'
      const lockupAddress = normalizeWalletAddress(req.body.lockupAddress || req.body.flowContract);
      if (!lockupAddress) {
        return res.status(400).json({ ok: false, error: 'Invalid contract address' });
      }
      const streamId = req.body.streamId || req.body.flowId;
      if (!streamId) {
        return res.status(400).json({ ok: false, error: 'streamId/flowId required' });
      }

      await relayerService.verifyRelayerAuth({
        req,
        action: 'deploy-sablier-wrapper',
        payload: { lockupAddress, streamId: streamId.toString(), streamType },
        vaultAddress: existing.vaultAddress
      });

      let deployed;
      if (streamType === 'flow') {
        deployed = await deploySablierV2FlowWrapper({
          flowContract: lockupAddress,
          flowId: streamId,
          beneficiary: existing.vaultAddress
        });
      } else {
        deployed = await deploySablierV2OperatorWrapper({
          lockupAddress,
          streamId: BigInt(streamId),
          beneficiary: existing.vaultAddress
        });
      }

      // Set operator to VestingAdapter so the protocol can release collateral at unlock.
      const relayer = getRelayerWallet();
      const wrapperAbi = streamType === 'flow' 
        ? ['function setOperator(address newOperator)', 'function operator() view returns (address)']
        : [
          'function setOperator(address newOperator)',
          'function operator() view returns (address)',
          'function beneficiary() view returns (address)',
          'function lockup() view returns (address)',
          'function streamId() view returns (uint256)'
        ];
        
      const wrapperContract = new ethers.Contract(
        deployed.wrapperAddress,
        wrapperAbi,
        relayer
      );
      try {
        const current = await wrapperContract.operator();
        if (!current || current === ethers.ZeroAddress) {
          const tx = await wrapperContract.setOperator(vestingAdapter.address);
          await tx.wait(1);
        }
      } catch (_) { }

      return res.json({
        ok: true,
        vaultAddress: existing.vaultAddress,
        wrapperAddress: deployed.wrapperAddress,
        deployTxHash: deployed.deployTxHash,
        type: streamType,
        operator: vestingAdapter.address,
        notes:
          'Next step: approve the wrapper as operator in your Sablier lockup so it can withdraw to the VestingAdapter.'
      });
    } catch (error) {
      console.error('[privacy] sablier wrapper deploy failed', error?.message || error);
      return res.status(500).json({ ok: false, error: error?.message || 'Unable to deploy wrapper' });
    }
  }
);

const sanitizePayload = (req, _res, next) => {
  const payload = req.body || {};
  const sanitized = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (typeof value === 'string') {
      sanitized[key] = value.trim().slice(0, 500);
    } else {
      sanitized[key] = value;
    }
  });
  req.body = sanitized;
  next();
};

app.post(
  '/api/agent/chat',
  chatLimiter,
  validateBody(chatSchema),
  verifyTurnstile,
  async (req, res) => {
    try {
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const sessionFingerprint = buildSessionFingerprint(req);
      let memory = [];
      try {
        memory = await persistence.listRecentAgentConversations({
          limit: 90,
          userId: req.user?.id || undefined,
          sessionFingerprint: req.user?.id ? undefined : sessionFingerprint
        });
      } catch (error) {
        console.warn('[agent] conversation memory unavailable', error?.message || error);
      }
      console.log('[agent] incoming chat', {
        message: req.body?.message?.slice?.(0, 80) || '',
        historyCount: history.length
      });
      let platformSnapshot = null;
      try {
        platformSnapshot = await getPlatformSnapshot();
      } catch (e) {
        // non-fatal
      }
      const result = await answerAgent(agent, {
        message: req.body?.message,
        history,
        memory,
        context: req.body?.context || null,
        platformSnapshot
      });
      try {
        await persistence.saveAgentConversation({
          userId: req.user?.id || null,
          sessionFingerprint,
          message: req.body?.message || '',
          answer: result.answer || '',
          mode: result.mode || '',
          provider: result.provider || '',
          metadata: {
            sourceFiles: (result.sources || []).map((source) => source.file).slice(0, 8),
            actionTypes: (result.actions || []).map((action) => action.type).slice(0, 8),
            intent: result.intent || '',
            confidence: result.confidence ?? null
          }
        });
      } catch (error) {
        console.warn('[agent] unable to save conversation', error?.message || error);
      }
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[agent] chat error', error?.message || error, error);
      res.status(200).json({
        ok: false,
        error: error?.message || 'Agent unavailable'
      });
    }
  }
);

app.post('/api/write', requireSession, validateBody(writeSchema), (req, res) => {
  res.json({ ok: true, action: 'write', data: req.body || {} });
});

app.post(
  '/api/docs/open',
  requireSession,
  validateBody(docsOpenSchema),
  (req, res) => {
    res.json({ ok: true, action: 'docs_open', data: req.body || {} });
  }
);

app.post('/api/pools', requireSession, strictLimiter, validateBody(createPoolSchema), async (req, res) => {
  try {
    const ownerWallet = req.user?.walletAddress;
    if (!ownerWallet) {
      return res.status(401).json({ ok: false, error: 'Wallet session required' });
    }
    const pool = await persistence.createPool({
      ownerWallet,
      name: req.body.name,
      chain: req.body.chain || '',
      preferences: req.body.preferences || {},
      status: req.body.status || 'active'
    });
    res.json({ ok: true, pool });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Pool create failed' });
  }
});

app.post(
  '/api/pools/:id/preferences',
  requireSession,
  strictLimiter,
  validateBody(updatePoolSchema),
  async (req, res) => {
    try {
      const ownerWallet = req.user?.walletAddress;
      if (!ownerWallet) {
        return res.status(401).json({ ok: false, error: 'Wallet session required' });
      }
      const pool = await persistence.updatePoolPreferences({
        id: req.params.id,
        ownerWallet,
        preferences: req.body.preferences,
        status: req.body.status
      });
      if (!pool) {
        return res.status(404).json({ ok: false, error: 'Pool not found' });
      }
      res.json({ ok: true, pool });
    } catch (error) {
      res.status(200).json({ ok: false, error: error?.message || 'Pool update failed' });
    }
  }
);

app.get('/api/pools', strictLimiter, async (req, res) => {
  try {
    const pools = await persistence.listPools({
      chain: normalizeText(req.query?.chain, 40),
      ownerWallet: normalizeText(req.query?.ownerWallet, 120),
      status: normalizeText(req.query?.status, 40)
    });
    const enriched = pools.map(pool => ({
      ...pool,
      capacity: pool.preferences?.maxLoanUsd ? pool.preferences.maxLoanUsd * 1e6 : 0, 
      utilization: pool.totalContributed && pool.preferences?.maxLoanUsd 
        ? Math.floor((Number(pool.totalContributed) / (pool.preferences.maxLoanUsd * 1e6)) * 100) 
        : 0,
      apy: pool.preferences?.interestBps ? (pool.preferences.interestBps / 100).toFixed(1) : "0.0",
      riskScore: pool.preferences?.riskTier === 'conservative' ? 'Low' : 'Medium'
    }));
    if (!enriched || enriched.length === 0) {
      // Return high-fidelity mock pools for the demo
      return res.json({
        ok: true,
        items: [
          { name: "USDC Alpha Node", capacity: 5000000000, utilization: 42, apy: "6.5", riskScore: "Low" },
          { name: "Sovereign Yield Pool", capacity: 1200000000, utilization: 15, apy: "8.2", riskScore: "Low" },
          { name: "Institutional Term Node", capacity: 10000000000, utilization: 88, apy: "4.8", riskScore: "Low" }
        ]
      });
    }
    res.json({ ok: true, items: enriched });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Pool list failed' });
  }
});

app.get('/api/pools/browse', strictLimiter, async (req, res) => {
  try {
    let borrowerWallet = null;
    if (req.query?.borrowerWallet) {
      try {
        borrowerWallet = ethers.getAddress(String(req.query.borrowerWallet).trim());
      } catch {
        borrowerWallet = null;
      }
    }
    const chain = normalizeText(req.query?.chain, 40);
    const accessFilter = normalizeText(req.query?.accessFilter, 20) || 'all';

    let pools = await persistence.listPools({ chain, status: 'active' });

    const enriched = [];
    for (const pool of pools) {
      const prefs = normalizePoolPreferences(pool);
      const accessType = prefs.accessType || 'open';
      let canAccess = true;
      let lockReason = null;
      if (accessType === 'premium' && prefs.premiumToken) {
        const bal = borrowerWallet ? await checkTokenBalance(borrowerWallet, prefs.premiumToken) : 0n;
        canAccess = bal > 0n;
        if (!canAccess) lockReason = 'Requires premium token';
      } else if (accessType === 'community' && prefs.communityToken) {
        const bal = borrowerWallet ? await checkTokenBalance(borrowerWallet, prefs.communityToken) : 0n;
        canAccess = bal > 0n;
        if (!canAccess) lockReason = 'Requires community token';
      }

      if (accessFilter === 'open' && accessType !== 'open') continue;
      if (accessFilter === 'accessible' && !canAccess) continue;

      enriched.push({
        ...pool,
        accessType,
        canAccess,
        lockReason,
        preferences: prefs
      });
    }
    res.json({ ok: true, pools: enriched });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Pool browse failed' });
  }
});

// --- Lender (privacy-lite) endpoints ---
//
// These endpoints intentionally return *aggregate-only* stats suitable for a lender UX
// that does not expose borrower/token identifiers. On-chain activity is still public,
// but we avoid making correlation easier via the app API.

const LENDER_METRICS_TTL_MS = 10_000;
const lenderMetricsCache = { at: 0, data: null };

const getLenderPoolMetrics = async () => {
  const now = Date.now();
  if (lenderMetricsCache.data && now - lenderMetricsCache.at < LENDER_METRICS_TTL_MS) {
    return lenderMetricsCache.data;
  }
  const contract = new ethers.Contract(lendingPool.address, lendingPoolDeployment.abi, provider);
  const [totalDeposits, totalBorrowed, utilizationBps, rateBps] = await Promise.all([
    contract.totalDeposits(),
    contract.totalBorrowed(),
    contract.utilizationRateBps(),
    contract.getInterestRateBps()
  ]);
  const data = {
    totalDeposits: totalDeposits?.toString?.() ?? String(totalDeposits ?? '0'),
    totalBorrowed: totalBorrowed?.toString?.() ?? String(totalBorrowed ?? '0'),
    utilizationBps: Number(utilizationBps ?? 0n),
    rateBps: Number(rateBps ?? 0n)
  };
  lenderMetricsCache.at = now;
  lenderMetricsCache.data = data;
  return data;
};

const buildEstimatedReturnProjections = ({ principalUsd, aprBps, horizonsYears, feeBps = 0 }) => {
  const principal = Number(principalUsd);
  const rate = Number(aprBps);
  const fee = Number(feeBps);
  const horizons = (horizonsYears || []).filter((x) => typeof x === 'number' && x > 0 && x <= 10);
  const safePrincipal = Number.isFinite(principal) && principal > 0 ? principal : 0;
  const safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;
  const safeFee = Number.isFinite(fee) && fee >= 0 ? fee : 0;
  return horizons.map((years) => {
    const grossInterest = safePrincipal * (safeRate / 10_000) * years;
    const netInterest = grossInterest * (1 - safeFee / 10_000);
    const total = safePrincipal + netInterest;
    return {
      years,
      grossInterestUsd: Number(grossInterest.toFixed(2)),
      estimatedNetInterestUsd: Number(netInterest.toFixed(2)),
      estimatedTotalUsd: Number(total.toFixed(2))
    };
  });
};

app.get('/api/lender/projections', strictLimiter, async (req, res) => {
  try {
    const amountUsd = Number(req.query?.amountUsd ?? req.query?.amount ?? 0);
    const principalUsd = Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 0;
    const metrics = await getLenderPoolMetrics();

    // Note: This is an *estimate* for UI display. Contract logic does not guarantee
    // deposit yield; on-chain borrow interest is currently fixed at origination.
    const horizonsYears = [1 / 12, 1, 4, 5];
    const projections = buildEstimatedReturnProjections({
      principalUsd,
      aprBps: metrics.rateBps,
      horizonsYears,
      feeBps: 0
    });

    res.json({
      ok: true,
      network: DEPLOYMENTS_NETWORK,
      principalUsd,
      utilizationBps: metrics.utilizationBps,
      estimatedAprBps: metrics.rateBps,
      projections,
      disclaimer: 'Estimates only. Not guaranteed. Actual returns depend on utilization, borrower demand, and realized repayments.'
    });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Unable to compute projections' });
  }
});

const bucketMaturity = (daysToUnlock) => {
  const days = Number(daysToUnlock);
  if (!Number.isFinite(days) || days < 0) return 'unknown';
  if (days < 30) return 'lt30d';
  if (days < 180) return '30to180d';
  if (days < 365) return '180to365d';
  return 'gt365d';
};

app.get('/api/lender/portfolio-light', strictLimiter, async (req, res) => {
  try {
    const metrics = await getLenderPoolMetrics();

    const exposure = await persistence.getExposureTotals(null);
    const flaggedShare =
      exposure.totalExposureUsd > 0
        ? exposure.flaggedExposureUsd / exposure.totalExposureUsd
        : 0;

    // Use the existing repay schedule cache. This is intentionally a small sample and
    // aggregated to avoid leaking loan-level details.
    const scheduleRows = await fetchRepayScheduleRows().catch(() => []);
    const maturityBuckets = {
      lt30d: 0,
      '30to180d': 0,
      '180to365d': 0,
      gt365d: 0,
      unknown: 0
    };
    let sampleCount = 0;
    let activeCount = 0;
    for (const row of scheduleRows || []) {
      sampleCount += 1;
      if (row?.status === 'Active') activeCount += 1;
      const unlock = Number(row?.unlockTime || 0);
      const daysToUnlock =
        unlock > 0 ? Math.round((unlock * 1000 - Date.now()) / 86_400_000) : NaN;
      maturityBuckets[bucketMaturity(daysToUnlock)] += 1;
    }

    res.json({
      ok: true,
      network: DEPLOYMENTS_NETWORK,
      pool: {
        totalDeposits: metrics.totalDeposits,
        totalBorrowed: metrics.totalBorrowed,
        utilizationBps: metrics.utilizationBps,
        currentRateBps: metrics.rateBps
      },
      exposure: {
        chain: exposure.chain,
        totalExposureUsd: exposure.totalExposureUsd,
        flaggedExposureUsd: exposure.flaggedExposureUsd,
        flaggedExposureShare: Number(flaggedShare.toFixed(4)),
        uniqueTokenCount: exposure.uniqueTokenCount,
        uniqueFlaggedTokenCount: exposure.uniqueFlaggedTokenCount
      },
      maturity: {
        sampleCount,
        activeCount,
        buckets: maturityBuckets
      }
    });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Unable to build portfolio stats' });
  }
});

app.get('/api/community-pools', async (req, res) => {
  try {
    const walletAddressRaw =
      typeof req.query?.wallet === 'string' ? req.query.wallet.trim() : '';
    const walletAddress = walletAddressRaw && ethers.isAddress(walletAddressRaw)
      ? ethers.getAddress(walletAddressRaw)
      : null;
    const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200);
    const data = await readCommunityPools({ walletAddress, limit });
    res.json({ ok: true, totalCount: data.totalCount, items: data.items });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'Unable to fetch community pools',
      items: []
    });
  }
});

app.get('/api/community-pools/:poolId', async (req, res) => {
  try {
    const poolId = Number(req.params.poolId);
    if (!Number.isFinite(poolId) || poolId < 0) {
      return res.status(400).json({ ok: false, error: 'Invalid pool id' });
    }
    const walletAddressRaw =
      typeof req.query?.wallet === 'string' ? req.query.wallet.trim() : '';
    const walletAddress = walletAddressRaw && ethers.isAddress(walletAddressRaw)
      ? ethers.getAddress(walletAddressRaw)
      : null;
    const contract = new ethers.Contract(lendingPool.address, communityPoolReadAbi, provider);
    const totalCountRaw = await contract.communityPoolCount();
    const totalCount = Number(totalCountRaw || 0n);
    if (poolId >= totalCount) {
      return res.status(404).json({ ok: false, error: 'Community pool not found' });
    }
    const row = await contract.communityPools(poolId);
    let pendingRewards = null;
    if (walletAddress) {
      try {
        pendingRewards = await contract.pendingCommunityPoolRewards(poolId, walletAddress);
      } catch {
        pendingRewards = null;
      }
    }
    res.json({
      ok: true,
      item: toCommunityPoolItem(poolId, row, pendingRewards)
    });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'Unable to fetch community pool'
    });
  }
});

app.post('/api/match/quote', expensiveLimiter, validateBody(matchQuoteSchema), async (req, res) => {
  try {
    const { chain, desiredAmountUsd } = req.body;
    const pools = await persistence.listPools({ chain, status: 'active' });
    if (!pools.length) {
      return res.json({ ok: true, offers: [], reason: 'No pools available yet.' });
    }
    let pvUsd = 0;
    let ltvBps = 0;
    let unlockTime = req.body.unlockTime;
    let collateralToken = null;
    if (chain === 'base') {
      if (req.body.collateralId) {
        try {
          const adapterContract = new ethers.Contract(
            vestingAdapter.address,
            vestingAdapterDeployment.abi,
            provider
          );
          const details = await adapterContract.getDetails(
            toBigIntSafe(req.body.collateralId)
          );
          const quantity = details?.[0];
          const token = details?.[1];
          const unlock = details?.[2];
          unlockTime = unlockTime || Number(unlock || 0);
          if (token) collateralToken = ethers.getAddress(token);
          const valuation = await computeEvmDpv({
            quantity: quantity || 0n,
            token,
            unlockTime: unlockTime || 0
          });
          pvUsd = valuation.pv;
          ltvBps = valuation.ltvBps;
        } catch {
          pvUsd = 0;
          ltvBps = 0;
        }
      } else if (req.body.token && req.body.quantity && req.body.unlockTime) {
        if (req.body.token) collateralToken = ethers.getAddress(req.body.token);
        const valuation = await computeEvmDpv({
          quantity: req.body.quantity,
          token: req.body.token,
          unlockTime: req.body.unlockTime
        });
        pvUsd = valuation.pv;
        ltvBps = valuation.ltvBps;
      }
    } else if (chain === 'solana') {
      const items = await getVestedContracts();
      const streamId = req.body.streamId || req.body.collateralId;
      const entry = items.find(
        (item) =>
          item.chain === 'solana' &&
          (item.streamId === streamId || item.collateralId === streamId)
      );
      if (entry) {
        pvUsd = toNumber(entry.pv, 0);
        ltvBps = toNumber(entry.ltvBps, 0);
        unlockTime = unlockTime || Number(entry.unlockTime || 0);
        if (entry.token) collateralToken = entry.token;
      }
    }

    if (!pvUsd || !ltvBps) {
      const reason =
        chain === 'solana'
          ? 'Manual quote required (Solana valuation missing for this vesting stream).'
          : 'Manual quote required (valuation unavailable for this collateral).';
      await persistence
        .createMatchEvent({
          type: 'quote_missing_valuation',
          payload: {
            chain,
            desiredAmountUsd,
            collateralId: req.body.collateralId,
            streamId: req.body.streamId,
            pvUsd,
            ltvBps
          }
        })
        .catch(() => null);
      return res.json({
        ok: true,
        offers: [],
        valuation: { pvUsd, ltvBps, unlockTime },
        reason,
        note:
          chain === 'solana'
            ? 'Solana offers are advisory only for this MVP; settlement is Base-only.'
            : 'Offers are advisory; final loan terms are enforced onchain.'
      });
    }

    // Insider-aware LTV: cap LTV when wallet+token is flagged (see FOUNDER_INSIDER_RISK_AND_FLAGGING.md)
    const borrowerWallet = req.body.borrowerWallet ? String(req.body.borrowerWallet).trim().toLowerCase() : null;
    if (borrowerWallet) {
      try {
        const flags = await persistence.getRiskFlags({ walletAddress: borrowerWallet });
        const tokenLower = collateralToken ? String(collateralToken).trim().toLowerCase() : null;
        const applies = flags.filter(
          (f) => !f.tokenAddress || (tokenLower && f.tokenAddress.toLowerCase() === tokenLower)
        );
        if (applies.length) ltvBps = Math.min(ltvBps, INSIDER_LTV_BPS);
      } catch {
        // non-fatal: continue with uncapped LTV
      }
    }

    const baseRateBps = await getPoolInterestBps();
    const liquidityUsd = chain === 'base' ? await getAvailableLiquidityUsd() : null;
    const borrowerStats = req.body.borrowerWallet
      ? getProtocolBorrowerStats(String(req.body.borrowerWallet))
      : null;
    let offers = await buildPoolOffers({
      pools,
      desiredAmountUsd,
      pvUsd,
      ltvBps,
      chain,
      unlockTime,
      baseRateBps,
      borrowerWallet: req.body.borrowerWallet || null,
      collateralToken,
      tokenType: req.body.tokenType || null,
      tokenCategory: req.body.tokenCategory || null,
      liquidityUsd,
      borrowerStats,
      maxOffers: req.body.maxOffers
    });

    let concentrationWarning = null;
    if (
      CONCENTRATION_MAX_USD_PER_TOKEN != null &&
      CONCENTRATION_MAX_USD_PER_TOKEN > 0 &&
      collateralToken &&
      (desiredAmountUsd > 0 || pvUsd > 0)
    ) {
      try {
        const exposureUsd = await persistence.getLoanExposureByToken(collateralToken, chain === 'solana' ? 'solana' : 'base');
        const requestedUsd = desiredAmountUsd || (pvUsd * (ltvBps || 0)) / 10000;
        const headroom = Math.max(0, CONCENTRATION_MAX_USD_PER_TOKEN - exposureUsd);
        if (headroom <= 0) {
          offers = [];
          concentrationWarning = 'Concentration limit reached for this token; no new borrows until exposure decreases.';
        } else if (requestedUsd > headroom) {
          const capUsd = Math.min(headroom, pvUsd > 0 ? (pvUsd * (ltvBps || 0)) / 10000 : headroom);
          offers = offers.map((o) => ({
            ...o,
            maxBorrowUsd: Math.min(Number(o.maxBorrowUsd) || 0, capUsd),
            concentrationCapped: true
          })).filter((o) => (Number(o.maxBorrowUsd) || 0) > 0);
          concentrationWarning = `Concentration cap applied: max borrow for this token is ${headroom.toFixed(0)} USD (${exposureUsd.toFixed(0)} already in use).`;
        }
      } catch (e) {
        // non-fatal: continue with uncapped offers
      }
    }

    await persistence.createMatchEvent({
      type: 'quote',
      payload: {
        chain,
        desiredAmountUsd,
        collateralId: req.body.collateralId,
        streamId: req.body.streamId,
        pvUsd,
        ltvBps,
        offers
      }
    });

    res.json({
      ok: true,
      offers,
      valuation: { pvUsd, ltvBps, unlockTime },
      concentrationWarning: concentrationWarning || undefined,
      note:
        chain === 'solana'
          ? 'Solana offers are advisory only for this MVP; settlement is Base-only.'
          : 'Offers are advisory; final loan terms are enforced onchain.'
    });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Match quote failed' });
  }
});

app.post('/api/match/accept', strictLimiter, validateBody(matchAcceptSchema), async (req, res) => {
  try {
    const event = await persistence.createMatchEvent({
      type: 'accept',
      payload: req.body || {}
    });
    res.json({ ok: true, event });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Match accept failed' });
  }
});

app.post(
  '/api/analytics',
  strictLimiter,
  validateBody(analyticsSchema),
  sanitizePayload,
  async (req, res) => {
    try {
      const payload = req.body || {};
      await persistence.saveAnalyticsEvent({
        event: payload.event,
        page: payload.page || null,
        walletAddress:
          payload.walletAddress ||
          payload.properties?.walletAddress ||
          req.user?.walletAddress ||
          null,
        properties: payload.properties || {},
        userId: req.user?.id || null,
        sessionFingerprint: buildSessionFingerprint(req),
        ipHash: hashIp(getClientIp(req)),
        source: 'frontend'
      });
      res.json({ ok: true, action: 'analytics', data: payload });
    } catch (error) {
      res.status(200).json({
        ok: false,
        error: error?.message || 'Unable to persist analytics',
        data: req.body || {}
      });
    }
  }
);

app.post(
  '/api/chains/request',
  strictLimiter,
  validateBody(chainRequestSchema),
  sanitizePayload,
  async (req, res) => {
    try {
      const payload = req.body || {};
      await persistence.saveAnalyticsEvent({
        event: 'chain_support_requested',
        page: payload.page || 'unknown',
        walletAddress: payload.walletAddress || req.user?.walletAddress || null,
        properties: {
          chainId: payload.chainId ?? null,
          chainName: payload.chainName ?? null,
          feature: payload.feature ?? null,
          vestingStandard: payload.vestingStandard ?? null,
          message: payload.message ?? null
        },
        userId: req.user?.id || null,
        sessionFingerprint: buildSessionFingerprint(req),
        ipHash: hashIp(getClientIp(req)),
        source: 'frontend'
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(200).json({ ok: false, error: error?.message || 'Unable to record request' });
    }
  }
);

app.get('/api/admin/chain-requests', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const items = await persistence.listAnalyticsEvents({ event: 'chain_support_requested', limit });
    await recordAdminAudit(req, 'admin.chain_requests.read', { targetType: 'chain_requests', payload: { limit } });
    res.json({ ok: true, items });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to list requests', items: [] });
  }
});

app.get('/api/analytics/summary', expensiveLimiter, async (req, res) => {
  try {
    const windowHours = Math.min(Math.max(Number(req.query?.windowHours) || 24, 1), 24 * 30);
    const summary = await persistence.getAnalyticsSummary({ windowHours });
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'Unable to fetch analytics summary',
      summary: null
    });
  }
});

app.get('/api/analytics/benchmark', expensiveLimiter, async (req, res) => {
  try {
    const windowDays = Math.min(Math.max(Number(req.query?.windowDays) || 30, 1), 365);
    const benchmark = await persistence.getAnalyticsBenchmark({ windowDays });
    res.json({ ok: true, benchmark });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'Unable to fetch analytics benchmark',
      benchmark: null
    });
  }
});

const buildAgentReplaySummary = (rows, windowHours) => {
  const now = Date.now();
  const windowMs = windowHours * 60 * 60 * 1000;
  const since = now - windowMs;
  const filtered = (rows || [])
    .map((row) => {
      const createdAtMs = row?.createdAt ? Date.parse(row.createdAt) : NaN;
      if (!Number.isFinite(createdAtMs) || createdAtMs < since) return null;
      const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const intent =
        typeof metadata.intent === 'string' && metadata.intent
          ? metadata.intent
          : 'unknown';
      const confidence = Number(metadata.confidence);
      return {
        createdAtMs,
        intent,
        confidence: Number.isFinite(confidence) ? confidence : null
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);

  const intentCounts = {};
  let confidenceSum = 0;
  let confidenceCount = 0;
  filtered.forEach((item) => {
    intentCounts[item.intent] = (intentCounts[item.intent] || 0) + 1;
    if (item.confidence !== null) {
      confidenceSum += item.confidence;
      confidenceCount += 1;
    }
  });
  const avgConfidence =
    confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 1000) / 1000 : null;
  const topIntentEntry = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0] || null;
  const topIntent = topIntentEntry ? topIntentEntry[0] : 'unknown';

  const bucketSizeMs = 60 * 60 * 1000;
  const bucketMap = new Map();
  const bucketStart = Math.floor(since / bucketSizeMs) * bucketSizeMs;
  const bucketEnd = Math.floor(now / bucketSizeMs) * bucketSizeMs;
  for (let ts = bucketStart; ts <= bucketEnd; ts += bucketSizeMs) {
    bucketMap.set(ts, {
      t: new Date(ts).toISOString(),
      count: 0,
      confidenceAvg: null,
      confidenceSum: 0,
      confidenceCount: 0,
      dominantIntent: 'unknown',
      intents: {}
    });
  }
  filtered.forEach((item) => {
    const key = Math.floor(item.createdAtMs / bucketSizeMs) * bucketSizeMs;
    const bucket = bucketMap.get(key);
    if (!bucket) return;
    bucket.count += 1;
    bucket.intents[item.intent] = (bucket.intents[item.intent] || 0) + 1;
    if (item.confidence !== null) {
      bucket.confidenceSum += item.confidence;
      bucket.confidenceCount += 1;
    }
  });
  const timeline = Array.from(bucketMap.values()).map((bucket) => {
    const dominantIntent =
      Object.entries(bucket.intents).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    const confidenceAvg =
      bucket.confidenceCount > 0
        ? Math.round((bucket.confidenceSum / bucket.confidenceCount) * 1000) / 1000
        : null;
    return {
      t: bucket.t,
      count: bucket.count,
      confidenceAvg,
      dominantIntent
    };
  });

  const half = Math.max(1, Math.floor(timeline.length / 2));
  const firstHalf = timeline.slice(0, half).filter((item) => item.confidenceAvg !== null);
  const secondHalf = timeline.slice(half).filter((item) => item.confidenceAvg !== null);
  const avg = (arr) =>
    arr.length
      ? arr.reduce((sum, item) => sum + Number(item.confidenceAvg || 0), 0) / arr.length
      : null;
  const firstHalfAvg = avg(firstHalf);
  const secondHalfAvg = avg(secondHalf);
  const confidenceDelta =
    firstHalfAvg !== null && secondHalfAvg !== null
      ? Math.round((secondHalfAvg - firstHalfAvg) * 1000) / 1000
      : null;

  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    totalTurns: filtered.length,
    avgConfidence,
    topIntent,
    intentCounts,
    drift: {
      firstHalfAvg:
        firstHalfAvg !== null ? Math.round(firstHalfAvg * 1000) / 1000 : null,
      secondHalfAvg:
        secondHalfAvg !== null ? Math.round(secondHalfAvg * 1000) / 1000 : null,
      confidenceDelta
    },
    timeline
  };
};

app.get('/api/agent/replay', expensiveLimiter, async (req, res) => {
  try {
    const windowHours = Math.min(Math.max(Number(req.query?.windowHours) || 48, 1), 24 * 14);
    const sessionFingerprint = buildSessionFingerprint(req);
    const rows = await persistence.listRecentAgentConversations({
      limit: 400,
      userId: req.user?.id || undefined,
      sessionFingerprint: req.user?.id ? undefined : sessionFingerprint
    });
    const replay = buildAgentReplaySummary(rows, windowHours);
    res.json({ ok: true, replay });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'Unable to fetch agent replay',
      replay: null
    });
  }
});

const safeRate = (num, denom) => {
  if (!denom) return 0;
  return Math.round((num / denom) * 10000) / 100;
};

const countActivitySince = (sinceEpochSec) => {
  const counts = {};
  activityEvents.forEach((item) => {
    const ts = Number(item.timestamp || 0);
    if (ts < sinceEpochSec) return;
    const key = item.type || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

const countDefaultsSince = (sinceEpochSec) => {
  let total = 0;
  activityEvents.forEach((item) => {
    const ts = Number(item.timestamp || 0);
    if (ts < sinceEpochSec) return;
    if (item.type === 'LoanSettled' && item.defaulted) {
      total += 1;
    }
  });
  return total;
};

/** Aggregate-only platform snapshot for CRDT AI and public dashboards. No addresses, no per-user data. */
const getPlatformSnapshot = async () => {
  const now = Math.floor(Date.now() / 1000);
  const window24h = now - 24 * 3600;
  const window7d = now - 7 * 24 * 3600;
  const counts24h = countActivitySince(window24h);
  const counts7d = countActivitySince(window7d);
  const defaults24h = countDefaultsSince(window24h);
  const defaults7d = countDefaultsSince(window7d);
  let poolStats = null;
  try {
    const poolContract = new ethers.Contract(
      lendingPoolDeployment.address,
      [
        'function totalDeposits() view returns (uint256)',
        'function totalBorrowed() view returns (uint256)',
        'function getInterestRateBps() view returns (uint256)',
        'function utilizationRateBps() view returns (uint256)',
        'function communityPoolCount() view returns (uint256)'
      ],
      provider
    );
    const [totalDeposits, totalBorrowed, rateBps, utilBps, communityPoolCount] = await Promise.all([
      poolContract.totalDeposits().catch(e => { console.error('[snapshot] totalDeposits failed:', e.message); return 0n; }),
      poolContract.totalBorrowed().catch(e => { console.error('[snapshot] totalBorrowed failed:', e.message); return 0n; }),
      poolContract.getInterestRateBps().catch(e => { console.error('[snapshot] getInterestRateBps failed:', e.message); return 600n; }),
      poolContract.utilizationRateBps().catch(e => { console.error('[snapshot] utilizationRateBps failed:', e.message); return 0n; }),
      poolContract.communityPoolCount().catch(e => { console.error('[snapshot] communityPoolCount failed:', e.message); return 0n; })
    ]);
    
    // 2. Sum backend-tracked deposits
    let backendTotalUnits = 0;
    try {
      const { data: dbDeposits, error } = await persistence.supabaseClient().from('user_deposits').select('amount');
      if (error) {
        console.error('[snapshot] Supabase error:', error);
      } else if (dbDeposits) {
        console.log(`[snapshot] Found ${dbDeposits.length} backend deposits`);
        backendTotalUnits = dbDeposits.reduce((acc, dep) => acc + Number(dep.amount || 0), 0) * 1e6;
        console.log(`[snapshot] Backend units: ${backendTotalUnits}`);
      }
    } catch (err) {
      console.error('[snapshot] Backend sum failed:', err.message);
    }

    poolStats = {
      totalDeposits: (BigInt(totalDeposits || 0n) + BigInt(backendTotalUnits)).toString(),
      totalBorrowed: (totalBorrowed || 0n).toString(),
      interestRateBps: rateBps ? rateBps.toString() : '600',
      utilizationRateBps: utilBps ? utilBps.toString() : '0',
      communityPoolCount: communityPoolCount ? communityPoolCount.toString() : '0'
    };
    console.log('[snapshot] poolStats.totalDeposits:', poolStats.totalDeposits);
  } catch (err) {
    console.error('[snapshot] Global catch:', err.message);
    // Fallback to real DB deposits even if contract query fails
    let backendOnlyUnits = 0;
    try {
      const { data } = await persistence.supabaseClient().from('user_deposits').select('amount');
      if (data) backendOnlyUnits = data.reduce((acc, dep) => acc + Number(dep.amount || 0), 0) * 1e6;
    } catch (e) {}
    poolStats = { totalDeposits: backendOnlyUnits.toString() };
  }

  const totalUnits = parseFloat(poolStats.totalDeposits || '0');

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    growth: {
      tvlUsd: totalUnits / 1e12, // Millions for frontend
      debtUsd: 0.1,
      healthFactor: 1.0
    },
    revenue: {
      total: totalUnits / 1e9, // Thousands for frontend
      fees: 0
    },
    market: {
      globalTvl: poolStats ? poolStats.totalDeposits : 1240000000000
    },
    pool: poolStats
  };
};

app.post('/api/lend/withdraw', async (req, res) => {
  const { id, walletAddress } = req.body;
  if (!id) return res.status(400).json({ ok: false, error: 'Deposit ID required' });
  
  try {
    const success = await persistence.deleteDeposit(id);
    res.json({ ok: true, success });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const MarketDataService = require('./lib/MarketDataService');

const buildKpiDashboard = async (windowHours) => {
  const metrics = await persistence.getAnalyticsMetrics({ windowHours });
  const sinceEpochSec = Math.floor(Date.now() / 1000 - windowHours * 60 * 60);
  const activityCounts = countActivitySince(sinceEpochSec);
  const defaultCount = countDefaultsSince(sinceEpochSec);
  const latestSnapshot = vestedSnapshots[0]?.summary || null;
  const events = metrics.eventCounts || {};

  // Fetch live market data
  const globalTVLData = await MarketDataService.getGlobalTVL();
  const latestGlobalTVL = globalTVLData ? globalTVLData[globalTVLData.length - 1]?.tvl : 0;

  const walletConnect = events.wallet_connect || 0;
  const borrowStart = events.borrow_start || 0;
  const quoteRequested = events.quote_requested || 0;
  const quoteAccepted = events.quote_accepted || 0;
  const chainSupportRequested = events.chain_support_requested || 0;
  const loanCreated = activityCounts.LoanCreated || events.loan_created || 0;
  const loanRepaid = activityCounts.LoanRepaid || events.loan_repaid || 0;
  const loanSettled = activityCounts.LoanSettled || events.loan_settled || 0;

  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    market: {
      globalTvl: latestGlobalTVL || 1240000000000
    },
    growth: {
      uniqueWallets: metrics.uniqueWallets || 0,
      trackedEvents: metrics.totalEvents || 0,
      lastActivityAt: metrics.lastEventAt || null,
      tvlUsd: (latestSnapshot?.totalPv || 42800000) / 1e6, // Use indexed PV
      debtUsd: (latestSnapshot?.totalDebt || 12400000) / 1e6
    },
    revenue: {
      total: (latestSnapshot?.totalDebt || 12400000) * 0.005 / 1e3 // 50bps est
    },
    credit: {
      loansCreated: loanCreated,
      loansRepaid: loanRepaid,
      loansSettled: loanSettled,
      activeLoans: latestSnapshot?.active || 0,
      trackedCollateralPositions: latestSnapshot?.total || 0
    },
    risk: {
      defaults: defaultCount,
      avgLtvBps: latestSnapshot?.avgLtvBps || 0,
      avgPv: latestSnapshot?.avgPv || 0
    },
    engagement: {
      funnel: {
        walletConnect,
        borrowStart,
        quoteRequested,
        quoteAccepted,
        loanCreated
      },
      demandSignals: {
        chainSupportRequested
      },
      conversionRatesPct: {
        walletToBorrowStart: safeRate(borrowStart, walletConnect),
        borrowStartToQuote: safeRate(quoteRequested, borrowStart),
        quoteToLoanCreated: safeRate(loanCreated, quoteRequested)
      }
    },
    raw: {
      analyticsEvents: events,
      activityEvents: activityCounts
    }
  };
};

app.get('/api/analytics/tvl-history', async (req, res) => {
  try {
    const snapshot = await getPlatformSnapshot();
    const currentTvl = parseFloat(snapshot.pool?.totalDeposits || '42800000') / 1e6;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const data = months.map((name, i) => {
      const growthFactor = 0.6 + (i * 0.08); 
      return {
        name,
        tvl: Math.round(currentTvl * growthFactor * (0.95 + Math.random() * 0.1))
      };
    });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/market/quotes', async (req, res) => {
  try {
    const symbols = ['USDC', 'VESTRA', 'ETH', 'BTC'];
    const quotes = await Promise.all(symbols.map(async (symbol) => {
       const price = await SovereignDataService.getConsensusPrice(symbol);
       return {
         asset: symbol,
         price: price ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--',
         volume: (Math.random() * 10 + 1).toFixed(1) + 'M',
         apy: (Math.random() * 5 + 3).toFixed(1) + '%',
         trend: Math.random() > 0.4 ? 'up' : 'down'
       };
    }));
    res.json({ ok: true, items: quotes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/analytics/performance', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ ok: false, error: 'wallet required' });
    let baseValue = 52400;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = days.map((name) => {
      baseValue = baseValue * (1 + ((Math.random() * 4) - 1.5) / 100);
      return { name, value: Math.round(baseValue) };
    });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/analytics/yield-history', (req, res) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  let baseApy = 4.0;
  const data = months.map(name => {
    baseApy += (Math.random() * 0.4) - 0.15;
    return { name, apy: parseFloat(baseApy.toFixed(1)) };
  });
  res.json({ ok: true, data });
});

app.get('/api/kpi/dashboard', expensiveLimiter, async (req, res) => {
  try {
    const windowHours = Math.min(Math.max(Number(req.query?.windowHours) || 24, 1), 24 * 30);
    const kpi = await buildKpiDashboard(windowHours);
    res.json({ ok: true, kpi });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'Unable to build KPI dashboard',
      kpi: null
    });
  }
});

app.get(
  '/api/admin/debug/identity/:walletAddress',
  adminLimiter,
  requireSession,
  requireAdmin,
  async (req, res) => {
    const walletAddress = normalizeWalletAddress(req.params.walletAddress || '');
    if (!walletAddress) {
      return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
    }
    try {
      const profile = await persistence.getIdentityProfileByWallet(walletAddress);
      const attestations = await persistence.listIdentityAttestations(walletAddress);
      const computed = await buildIdentityProfile(walletAddress);
      await recordAdminAudit(req, 'admin.identity.read', {
        targetType: 'identity_profile',
        targetId: walletAddress,
        payload: {
          attestationCount: attestations.length
        }
      });
      return res.json({
        ok: true,
        walletAddress,
        persisted: {
          profile,
          attestations
        },
        computed
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Failed to read identity debug payload'
      });
    }
  }
);

app.patch(
  '/api/admin/debug/identity/:walletAddress/profile',
  adminLimiter,
  requireSession,
  requireAdmin,
  validateBody(adminIdentityPatchSchema),
  async (req, res) => {
    const walletAddress = normalizeWalletAddress(req.params.walletAddress || '');
    if (!walletAddress) {
      return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
    }
    try {
      const existing = await persistence.getIdentityProfileByWallet(walletAddress);
      const updated = await persistence.upsertIdentityProfile({
        walletAddress,
        linkedAt:
          req.body.linkedAt !== undefined
            ? req.body.linkedAt
            : existing?.linkedAt || null,
        identityProofHash:
          req.body.identityProofHash !== undefined
            ? req.body.identityProofHash
            : existing?.identityProofHash || null,
        sanctionsPass:
          req.body.sanctionsPass !== undefined
            ? req.body.sanctionsPass
            : existing?.sanctionsPass ?? true
      });
      await recordAdminAudit(req, 'admin.identity.profile.patch', {
        targetType: 'identity_profile',
        targetId: walletAddress,
        payload: {
          previous: {
            linkedAt: existing?.linkedAt || null,
            identityProofHash: existing?.identityProofHash || null,
            sanctionsPass: existing?.sanctionsPass ?? null
          },
          next: {
            linkedAt: updated?.linkedAt || null,
            identityProofHash: updated?.identityProofHash || null,
            sanctionsPass: updated?.sanctionsPass ?? null
          }
        }
      });
      return res.json({ ok: true, profile: updated });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Failed to patch identity profile'
      });
    }
  }
);

app.get('/api/admin/debug/kpi', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const windowHours = Math.min(Math.max(Number(req.query?.windowHours) || 24, 1), 24 * 30);
    const kpi = await buildKpiDashboard(windowHours);
    await recordAdminAudit(req, 'admin.kpi.read', {
      targetType: 'kpi',
      targetId: String(windowHours),
      payload: {
        windowHours
      }
    });
    return res.json({
      ok: true,
      source: persistence.useSupabase ? 'supabase' : 'sqlite',
      kpi
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to build admin KPI payload'
    });
  }
});

app.get(
  '/api/admin/airdrop/leaderboard',
  adminLimiter,
  requireSession,
  requireAdmin,
  async (req, res) => {
    try {
      const windowDays = Math.min(Math.max(Number(req.query?.windowDays) || 30, 1), 365);
      const limit = Math.min(Math.max(Number(req.query?.limit) || 200, 1), 1000);
      const phase = String(req.query?.phase || 'all').trim().toLowerCase();
      const leaderboard = await airdropService.getLeaderboard({ windowDays, limit, phase });
      await recordAdminAudit(req, 'admin.airdrop.leaderboard.read', {
        targetType: 'airdrop_leaderboard',
        targetId: String(windowDays),
        payload: {
          windowDays,
          limit,
          phase
        }
      });
      return res.json({ ok: true, leaderboard });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Failed to build airdrop leaderboard',
        leaderboard: null
      });
    }
  }
);

app.get(
  '/api/admin/airdrop/leaderboard.csv',
  adminLimiter,
  requireSession,
  requireAdmin,
  async (req, res) => {
    try {
      const windowDays = Math.min(Math.max(Number(req.query?.windowDays) || 30, 1), 365);
      const limit = Math.min(Math.max(Number(req.query?.limit) || 200, 1), 1000);
      const phase = String(req.query?.phase || 'all').trim().toLowerCase();
      const payload = await persistence.getAirdropLeaderboard({ windowDays, limit, phase });
      const rows = [
        [
          'rank',
          'wallet_address',
          'score',
          'event_count',
          'unique_events',
          'high_value_actions',
          'feedback_count',
          'penalties',
          'last_seen_at'
        ],
        ...(payload?.leaderboard || []).map((row) => [
          row.rank,
          row.walletAddress,
          row.score,
          row.eventCount,
          row.uniqueEvents,
          row.highValueActions,
          row.feedbackCount,
          row.penalties,
          row.lastSeenAt || ''
        ])
      ];
      const csv = rows
        .map((row) =>
          row
            .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');
      const filename = `airdrop-leaderboard-${payload?.phase || phase}-${windowDays}d.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await recordAdminAudit(req, 'admin.airdrop.leaderboard.export', {
        targetType: 'airdrop_leaderboard_csv',
        targetId: String(windowDays),
        payload: {
          windowDays,
          limit,
          phase
        }
      });
      return res.send(csv);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Failed to export airdrop leaderboard CSV'
      });
    }
  }
);

app.get('/api/admin/risk/flags', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const wallet = typeof req.query?.wallet === 'string' ? req.query.wallet.trim().toLowerCase() : null;
    const token = typeof req.query?.token === 'string' ? req.query.token.trim().toLowerCase() : null;
    const items = await persistence.getRiskFlags({ walletAddress: wallet || undefined, tokenAddress: token || undefined });
    await recordAdminAudit(req, 'admin.risk.flags.read', { targetType: 'risk_flags', payload: { wallet: !!wallet, token: !!token } });
    return res.json({ ok: true, flags: items });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to fetch risk flags' });
  }
});

const riskFlagCreateSchema = z.object({
  walletAddress: z.string().min(1).max(42),
  tokenAddress: z.string().max(42).optional().nullable(),
  flagType: z.string().min(1).max(64),
  source: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional()
});

app.post('/api/admin/risk/flags', adminLimiter, requireSession, requireAdmin, validateBody(riskFlagCreateSchema), async (req, res) => {
  try {
    const { walletAddress, tokenAddress, flagType, source, metadata } = req.body;
    const created = await persistence.createRiskFlag({
      walletAddress: walletAddress.trim().toLowerCase(),
      tokenAddress: tokenAddress ? tokenAddress.trim().toLowerCase() : null,
      flagType,
      source: source || 'manual',
      metadata: metadata || null
    });
    await recordAdminAudit(req, 'admin.risk.flags.create', {
      targetType: 'risk_flags',
      targetId: created.id,
      payload: { flagType, wallet: walletAddress.slice(0, 10) + '...' }
    });
    return res.json({ ok: true, flag: created });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to create risk flag' });
  }
});

app.delete('/api/admin/risk/flags/:id', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    await persistence.deleteRiskFlag(id);
    await recordAdminAudit(req, 'admin.risk.flags.delete', { targetType: 'risk_flags', targetId: id });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to delete risk flag' });
  }
});

app.get('/api/admin/risk/cohort', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const byParam = String(req.query?.by || 'borrower').toLowerCase();
    const events = await persistence.loadEvents(limit * 3);
    const loanCreated = (events || []).filter((e) => e.type === 'LoanCreated');
    if (byParam === 'token') {
      const byToken = {};
      loanCreated.forEach((e) => {
        const token = (e.tokenAddress || '').toLowerCase();
        const b = (e.borrower || '').toLowerCase();
        if (!token || !b) return;
        if (!byToken[token]) byToken[token] = {};
        byToken[token][b] = (byToken[token][b] || 0) + 1;
      });
      const byTokenList = Object.entries(byToken).map(([token, wallets]) => ({
        token,
        borrowers: Object.entries(wallets)
          .map(([wallet, loanCount]) => ({ wallet, loanCount }))
          .sort((a, b) => b.loanCount - a.loanCount)
          .slice(0, 50)
      })).sort((a, b) => {
        const totalA = a.borrowers.reduce((s, x) => s + x.loanCount, 0);
        const totalB = b.borrowers.reduce((s, x) => s + x.loanCount, 0);
        return totalB - totalA;
      }).slice(0, limit);
      await recordAdminAudit(req, 'admin.risk.cohort.read', { targetType: 'risk_cohort', by: 'token' });
      return res.json({ ok: true, byToken: byTokenList });
    }
    const byBorrower = {};
    loanCreated.forEach((e) => {
      const b = (e.borrower || '').toLowerCase();
      if (!b) return;
      byBorrower[b] = (byBorrower[b] || 0) + 1;
    });
    const borrowers = Object.entries(byBorrower)
      .map(([wallet, loanCount]) => ({ wallet, loanCount }))
      .sort((a, b) => b.loanCount - a.loanCount)
      .slice(0, limit);
    await recordAdminAudit(req, 'admin.risk.cohort.read', { targetType: 'risk_cohort', by: 'borrower' });
    return res.json({ ok: true, borrowers });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to build cohort' });
  }
});

app.get('/api/admin/risk/concentration', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const token = (req.query?.token || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'Query token required' });
    const chain = (req.query?.chain || 'base').toLowerCase();
    const exposureUsd = await persistence.getLoanExposureByToken(token, chain);
    const limitUsd = CONCENTRATION_MAX_USD_PER_TOKEN;
    await recordAdminAudit(req, 'admin.risk.concentration.read', { targetType: 'concentration', targetId: token });
    return res.json({
      ok: true,
      token,
      chain,
      exposureUsd,
      limitUsd: limitUsd ?? null,
      withinLimit: limitUsd == null || exposureUsd <= limitUsd
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to get concentration' });
  }
});

app.get('/api/admin/risk/concentration-alerts', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const chain = (req.query?.chain || '').toLowerCase() || null;
    const exposureList = await persistence.getExposureByTokenList(chain);
    const limitUsd = CONCENTRATION_MAX_USD_PER_TOKEN;
    const threshold = limitUsd != null ? limitUsd * 0.8 : null;
    const alerts = exposureList
      .filter(({ exposureUsd }) => threshold != null && exposureUsd >= threshold)
      .map(({ token, exposureUsd }) => ({ token, exposureUsd, limitUsd }));
    await recordAdminAudit(req, 'admin.risk.concentration_alerts.read', { targetType: 'concentration_alerts' });
    return res.json({ ok: true, alerts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to build concentration alerts', alerts: [] });
  }
});

app.post('/api/admin/risk/backfill-concentration', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit ?? req.query?.limit ?? 500), 1), 2000);
    const chain = (req.body?.chain ?? req.query?.chain ?? 'base').toLowerCase();

    const loanManagerContract = new ethers.Contract(loanManager.address, loanManagerDeployment.abi, provider);
    const adapterContract = new ethers.Contract(vestingAdapter.address, vestingAdapterDeployment.abi, provider);

    const getTokenAddressForLoan = async (loanId) => {
      const isPrivate = await loanManagerContract.isPrivateLoan(loanId);
      const loan = isPrivate
        ? await loanManagerContract.privateLoans(loanId)
        : await loanManagerContract.loans(loanId);
      const collateralId = loan?.collateralId ?? loan?.[3];
      if (collateralId == null) return null;
      const details = await adapterContract.getDetails(collateralId);
      const token = details?.[1];
      return token ? ethers.getAddress(token) : null;
    };

    const loadEventsForBackfill = async (lim) => {
      const list = await persistence.loadEvents(lim);
      return list.map((e) => ({
        type: e.type,
        loanId: e.loanId,
        amount: e.amount,
        tokenAddress: e.tokenAddress,
        blockNumber: e.blockNumber,
        logIndex: e.logIndex
      }));
    };

    const result = await runBackfillConcentration({
      persistence,
      loadEvents: loadEventsForBackfill,
      getTokenAddressForLoan,
      chain,
      limit
    });

    await recordAdminAudit(req, 'admin.risk.backfill_concentration', {
      targetType: 'backfill_concentration',
      payload: { limit, chain, ...result }
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Backfill failed',
      processed: 0,
      created: 0,
      removed: 0,
      skipped: 0,
      errors: []
    });
  }
});

app.get('/api/admin/audit-logs', adminLimiter, requireSession, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const action = typeof req.query?.action === 'string' ? req.query.action : null;
    const items = await persistence.listAdminAuditLogs({ limit, action });
    await recordAdminAudit(req, 'admin.audit.read', {
      targetType: 'admin_audit_logs',
      targetId: action || 'all',
      payload: { limit, action }
    });
    return res.json({ ok: true, items });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to fetch admin audit logs',
      items: []
    });
  }
});

app.get('/api/exports/kpi.csv', expensiveLimiter, async (req, res) => {
  try {
    const windowHours = Math.min(Math.max(Number(req.query?.windowHours) || 24, 1), 24 * 30);
    const kpi = await buildKpiDashboard(windowHours);
    const rows = [
      ['metric', 'value'],
      ['window_hours', String(kpi.windowHours)],
      ['generated_at', kpi.generatedAt],
      ['growth.unique_wallets', String(kpi.growth.uniqueWallets)],
      ['growth.tracked_events', String(kpi.growth.trackedEvents)],
      ['credit.loans_created', String(kpi.credit.loansCreated)],
      ['credit.loans_repaid', String(kpi.credit.loansRepaid)],
      ['credit.loans_settled', String(kpi.credit.loansSettled)],
      ['credit.active_loans', String(kpi.credit.activeLoans)],
      ['risk.defaults', String(kpi.risk.defaults)],
      ['risk.avg_ltv_bps', String(kpi.risk.avgLtvBps)],
      ['risk.avg_pv', String(kpi.risk.avgPv)],
      ['engagement.wallet_connect', String(kpi.engagement.funnel.walletConnect)],
      ['engagement.borrow_start', String(kpi.engagement.funnel.borrowStart)],
      ['engagement.quote_requested', String(kpi.engagement.funnel.quoteRequested)],
      ['engagement.quote_accepted', String(kpi.engagement.funnel.quoteAccepted)],
      ['engagement.loan_created', String(kpi.engagement.funnel.loanCreated)],
      ['engagement.wallet_to_borrow_start_pct', String(kpi.engagement.conversionRatesPct.walletToBorrowStart)],
      ['engagement.borrow_start_to_quote_pct', String(kpi.engagement.conversionRatesPct.borrowStartToQuote)],
      ['engagement.quote_to_loan_created_pct', String(kpi.engagement.conversionRatesPct.quoteToLoanCreated)]
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="unlockd-kpi-dashboard.csv"');
    res.send(csv);
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'Unable to export KPI CSV'
    });
  }
});

app.post(
  '/api/notify/auction',
  strictLimiter,
  validateBody(notifySchema),
  verifyTurnstile,
  sanitizePayload,
  async (req, res) => {
    try {
      await recordNotification('auction', 'auction_notify', req.body || {}, req.user?.id);
      res.json({ ok: true, action: 'auction_notify', data: req.body || {} });
    } catch (error) {
      res.status(200).json({
        ok: false,
        error: error?.message || 'Unable to record notification',
        data: req.body || {}
      });
    }
  }
);

app.post(
  '/api/governance/subscribe',
  strictLimiter,
  validateBody(governanceSchema),
  verifyTurnstile,
  sanitizePayload,
  async (req, res) => {
    try {
      await recordSubmission('governance', req.body || {}, req.user?.id);
      res.json({ ok: true, action: 'governance_subscribe', data: req.body || {} });
    } catch (error) {
      res.status(200).json({
        ok: false,
        error: error?.message || 'Unable to record governance subscription',
        data: req.body || {}
      });
    }
  }
);

app.post(
  '/api/contact',
  strictLimiter,
  validateBody(contactSchema),
  verifyTurnstile,
  sanitizePayload,
  async (req, res) => {
    try {
      await recordSubmission('contact', req.body || {}, req.user?.id);
      res.json({ ok: true, action: 'contact', data: req.body || {} });
    } catch (error) {
      res.status(200).json({
        ok: false,
        error: error?.message || 'Unable to record contact submission',
        data: req.body || {}
      });
    }
  }
);

app.get('/api/activity', (_req, res) => {
  const items = activityEvents.map((e) => {
    // Do not expose correlatable identifiers in a public feed.
    const { borrower, loanId, txHash, logIndex, blockNumber, tokenAddress, ...rest } = e;
    return rest;
  });
  res.json({
    ok: true,
    items,
    meta: {
      lookbackBlocks: INDEXER_LOOKBACK_BLOCKS,
      lastIndexedBlock,
      latestChainBlock,
      lastPollAt
    }
  });
});

app.get('/api/risk/consensus/:token', async (req, res) => {
  const token = normalizeWalletAddress(req.params.token);
  if (!token) return res.status(400).json({ error: 'invalid token' });

  const votes = activityEvents.filter(e => e.type === 'VoteSubmitted' && e.tokenAddress?.toLowerCase() === token.toLowerCase());
  const consensus = votes.length > 0 ? Math.min(...votes.map(v => Number(v.payload.omegaBps))) : 10000;

  res.json({
    ok: true,
    token,
    consensusOmegaBps: consensus,
    votes: votes.map(v => ({
      agent: v.payload.agent,
      omegaBps: v.payload.omegaBps,
      timestamp: v.timestamp
    }))
  });
});

app.get('/api/geo-pings', async (_req, res) => {
  try {
    const items = await persistence.listGeoPings({ limit: 300 });
    res.json({
      ok: true,
      items,
      meta: {
        source: items.length ? 'user_geo_presence' : 'empty'
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || 'Unable to fetch geo pings',
      items: []
    });
  }
});

app.get('/api/exports/activity', requireSession, (_req, res) => {
  const exportsAdminOnly = process.env.EXPORTS_ADMIN_ONLY === 'true';
  const ipAllowlist = String(process.env.EXPORTS_IP_ALLOWLIST || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (ipAllowlist.length) {
    const ip = getClientIp(_req) || '';
    if (!ipAllowlist.includes(ip)) {
      return res.status(403).json({ ok: false, error: 'Export blocked by IP allowlist' });
    }
  }
  if (exportsAdminOnly) {
    const isAdmin =
      String(_req.user?.role || '').toLowerCase() === 'admin' ||
      isAdminWallet(_req.user?.walletAddress);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
  }
  const watermark = `exported_at=${new Date().toISOString()} user=${String(_req.user?.id || '').slice(0, 8)}`;
  const rows = [
    // Mirrors `/api/activity` privacy posture. The watermark preserves traceability
    // for ops without exposing per-loan linkage.
    ['Event', 'Amount', 'Timestamp', 'Watermark'],
    ...activityEvents.map((event) => [
      event.type,
      event.amount || '',
      event.timestamp
        ? new Date(event.timestamp * 1000).toISOString()
        : '',
      watermark
    ])
  ];
  const csv = rows.map((row) => row.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="vestra-activity.csv"');
  res.send(csv);
});

const fetchRepayScheduleRows = async () => {
  const now = Date.now();
  if (
    repayScheduleCache.items.length &&
    now - repayScheduleCache.at < REPAY_CACHE_TTL_MS
  ) {
    return repayScheduleCache.items;
  }
  if (repayScheduleInFlight) {
    return repayScheduleInFlight;
  }
  repayScheduleInFlight = (async () => {
    const contract = new ethers.Contract(
      loanManager.address,
      loanManagerDeployment.abi,
      provider
    );
    const count = await contract.loanCount();
    const total = Number(count);
    const limit = Math.min(total, 10);
    const start = Math.max(total - limit, 0);
    const ids = Array.from({ length: Math.max(0, total - start) }, (_, i) => start + i);
    const rows = await mapWithConcurrency(
      ids,
      async (loanId) => {
        const isPrivate = await contract.isPrivateLoan(loanId);
        const loan = isPrivate ? await contract.privateLoans(loanId) : await contract.loans(loanId);
        return {
          loanId,
          mode: isPrivate ? 'private' : 'public',
          principal: (loan?.[1] ?? 0n).toString(),
          interest: (loan?.[2] ?? 0n).toString(),
          // Loan struct: unlockTime is index 5 (index 4 is collateralAmount).
          unlockTime: Number(loan?.[5] ?? 0n),
          status: loan?.[6] ? 'Active' : 'Settled'
        };
      },
      RPC_CONCURRENCY_LIMIT
    );
    repayScheduleCache.items = rows;
    repayScheduleCache.at = Date.now();
    cachedRepaySchedule = rows;
    lastScheduleRefresh = repayScheduleCache.at;
    return rows;
  })();
  try {
    return await repayScheduleInFlight;
  } finally {
    repayScheduleInFlight = null;
  }
};

app.get('/api/repay-schedule', expensiveLimiter, async (_req, res) => {
  try {
    const rows = await fetchRepayScheduleRows();
    res.json({ ok: true, items: rows });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'error',
      items: cachedRepaySchedule,
      cachedAt: lastScheduleRefresh
    });
  }
});

const buildExplorerLink = (type, value) => {
  if (!value) return '';
  return `${EXPLORER_BASE_URL}/${type}/${value}`;
};

const summarizeSnapshot = (items) => {
  const total = items.length;
  const active = items.filter((item) => item.active).length;
  const avgLtv =
    total > 0
      ? Math.round(
        items.reduce((sum, item) => sum + Number(item.ltvBps || 0), 0) / total
      )
      : 0;
  const avgPv =
    total > 0
      ? Math.round(
        items.reduce((sum, item) => sum + Number(item.pv || 0), 0) / total
      )
      : 0;

  return {
    total,
    active,
    avgLtvBps: avgLtv,
    avgPv
  };
};

const storeSnapshot = async (items) => {
  const snapshot = {
    timestamp: Date.now(),
    summary: summarizeSnapshot(items),
    items,
    limit: INDEXER_SNAPSHOT_LIMIT
  };
  await persistence.saveSnapshot(snapshot);
  vestedSnapshots.unshift(snapshot);
  if (vestedSnapshots.length > INDEXER_SNAPSHOT_LIMIT) {
    vestedSnapshots.splice(INDEXER_SNAPSHOT_LIMIT);
  }
  if (items?.length) {
    cachedVestedContracts = items;
    cachedVestedContractsAt = snapshot.timestamp;
  }
};

const recordSubmission = async (channel, payload, userId = null) => {
  if (!persistence.useSupabase) return;
  try {
    await persistence.insertSubmission({ channel, payload, userId });
  } catch (error) {
    console.error('[persistence] submission insert failed', error?.message || error);
  }
};

const recordNotification = async (channel, template, payload, userId = null) => {
  if (!persistence.useSupabase) return;
  try {
    await persistence.insertNotification({
      channel,
      template,
      payload,
      userId,
      status: 'pending'
    });
  } catch (error) {
    console.error('[persistence] notification insert failed', error?.message || error);
  }
};

const getEvmVestedContracts = async () => {
  const loanContract = new ethers.Contract(
    loanManager.address,
    loanManagerDeployment.abi,
    provider
  );
  const adapterContract = new ethers.Contract(
    vestingAdapter.address,
    vestingAdapterDeployment.abi,
    provider
  );
  const valuationContract = new ethers.Contract(
    valuationEngine.address,
    valuationDeployment.abi,
    provider
  );

  const count = await loanContract.loanCount();
  const total = Number(count);
  const limit = Math.min(total, INDEXER_VESTED_LIMIT);
  const start = Math.max(total - limit, 0);
  const ids = Array.from({ length: Math.max(0, total - start) }, (_, i) => start + i);
  const rows = await mapWithConcurrency(
    ids,
    async (loanId) => {
      const isPrivate = await loanContract.isPrivateLoan(loanId);
      const loan = isPrivate ? await loanContract.privateLoans(loanId) : await loanContract.loans(loanId);
      const collateralId = loan?.[3];
      const vestingContract = await adapterContract.vestingContracts(collateralId);
      const [quantity, token, unlockTime] = await adapterContract.getDetails(collateralId);

      let tokenSymbol = '';
      let tokenDecimals = 18;
      try {
        const tokenContract = new ethers.Contract(token, erc20Abi, provider);
        tokenSymbol = await tokenContract.symbol();
        tokenDecimals = await tokenContract.decimals();
      } catch (error) {
        tokenSymbol = `Token ${token.slice(0, 6)}`;
      }

      let pv = 0n;
      let ltvBps = 0n;
      try {
        const valuation = await valuationContract.computeDPV(quantity, token, unlockTime);
        pv = valuation[0];
        ltvBps = valuation[1];
      } catch (error) {
        pv = 0n;
        ltvBps = 0n;
      }

      const createdEvent = activityEvents.find((event) => {
        const matchType = isPrivate ? 'PrivateLoanCreated' : 'LoanCreated';
        return event.type === matchType && event.loanId === loanId.toString();
      });
      // Loan struct: unlockTime is index 5 (index 4 is collateralAmount).
      const unlockTimestamp = Number(unlockTime || loan?.[5] || 0);
      const daysToUnlock =
        unlockTimestamp > 0
          ? Math.max(0, Math.round((unlockTimestamp * 1000 - Date.now()) / 86400000))
          : null;

      return {
        loanId,
        mode: isPrivate ? 'private' : 'public',
        borrower: isPrivate ? '' : loan?.[0],
        vault: isPrivate ? loan?.[0] : '',
        principal: (loan?.[1] ?? 0n).toString(),
        interest: (loan?.[2] ?? 0n).toString(),
        collateralId: collateralId.toString(),
        vestingContract: vestingContract || '',
        unlockTime: unlockTimestamp,
        active: Boolean(loan?.[6]),
        token,
        tokenSymbol,
        tokenDecimals,
        quantity: quantity.toString(),
        pv: pv.toString(),
        ltvBps: ltvBps.toString(),
        daysToUnlock,
        chain: 'evm',
        evidence: {
          escrowTx: createdEvent?.txHash
            ? buildExplorerLink('tx', createdEvent.txHash)
            : '',
          // Avoid linking private-mode loans to any address in user-facing APIs.
          wallet: !isPrivate && loan?.[0] ? buildExplorerLink('address', loan[0]) : '',
          token: token ? buildExplorerLink('address', token) : ''
        }
      };
    },
    RPC_CONCURRENCY_LIMIT
  );

  return rows.reverse();
};

const getVestedContracts = async () => {
  const [evmItems, solanaItems] = await Promise.all([
    getEvmVestedContracts(),
    withTimeout(fetchStreamflowVestingContracts(), SOLANA_STREAMFLOW_TIMEOUT_MS, [])
  ]);
  return [...evmItems, ...solanaItems];
};

const takeVestedSnapshot = async () => {
  if (snapshotInFlight) return;
  snapshotInFlight = true;
  try {
    const items = await getVestedContracts();
    await storeSnapshot(items);
  } catch (error) {
    console.error('[indexer] snapshot error', error?.message || error);
  } finally {
    snapshotInFlight = false;
  }
};

app.get('/api/vested-contracts', expensiveLimiter, async (req, res) => {
  const normalizeChain = (value) => String(value || '').trim().toLowerCase();
  const normalizeWallet = (value) => String(value || '').trim();
  const privacyRequested = String(req.query?.privacy || '') === '1';

  const chainFilter = normalizeChain(req.query?.chain);
  const walletFilterRaw = normalizeWallet(req.query?.wallet);

  const sessionWallets = {
    evm: new Set(),
    solana: new Set()
  };
  if (req.user) {
    const primaryEvm = normalizeWalletAddress(req.user?.walletAddress || '');
    const primarySol = normalizeSolanaAddress(req.user?.walletAddress || '');
    if (primaryEvm) sessionWallets.evm.add(primaryEvm.toLowerCase());
    if (primarySol) sessionWallets.solana.add(primarySol); // Solana is case-sensitive

    const linkedWallets = Array.isArray(req.user?.linkedWallets) ? req.user.linkedWallets : [];
    for (const link of linkedWallets) {
      const chainType = String(link?.chainType || '').toLowerCase();
      const addressRaw = String(link?.walletAddress || '').trim();
      if (chainType === 'solana') {
        const sol = normalizeSolanaAddress(addressRaw);
        if (sol) sessionWallets.solana.add(sol);
      } else {
        const evm = normalizeWalletAddress(addressRaw);
        if (evm) sessionWallets.evm.add(evm.toLowerCase());
      }
    }
  }

  const filterItems = async (items) => {
    const list = Array.isArray(items) ? items : [];
    if (!privacyRequested && !chainFilter && !walletFilterRaw) return list;

    if (privacyRequested && !req.user) {
      // `attachSession` is optional; we require it when privacy=1.
      throw Object.assign(new Error('Session required'), { statusCode: 401 });
    }

    // If a wallet filter is provided in privacy mode, only allow filtering for wallets
    // actually linked to the requesting session (prevents easy enumeration).
    if (privacyRequested && walletFilterRaw) {
      const asEvm = normalizeWalletAddress(walletFilterRaw);
      const asSol = normalizeSolanaAddress(walletFilterRaw);
      const evmOk = asEvm ? sessionWallets.evm.has(asEvm.toLowerCase()) : false;
      const solOk = asSol ? sessionWallets.solana.has(asSol) : false;
      if (!evmOk && !solOk) {
        throw Object.assign(new Error('Wallet mismatch'), { statusCode: 403 });
      }
    }

    let privacyVaultAddress = '';
    if (privacyRequested) {
      try {
        const vault = await persistence.getPrivacyVaultByUser(req.user?.id, 'evm');
        privacyVaultAddress = (vault?.vaultAddress || '').toLowerCase();
      } catch (_) {
        privacyVaultAddress = '';
      }
    }

    return list.filter((item) => {
      if (chainFilter && normalizeChain(item?.chain) !== chainFilter) {
        return false;
      }

      if (!privacyRequested) {
        // Public filtering behavior.
        if (!walletFilterRaw) return true;
        const borrower = normalizeWallet(item?.borrower);
        if (!borrower) return false;
        if (borrower === walletFilterRaw) return true;

        const itemChain = normalizeChain(item?.chain) || 'evm';
        if (itemChain === 'solana') {
          // Solana is case-sensitive base58; exact match only (already checked above)
          // but we can try normalizing both once to be sure
          return normalizeSolanaAddress(borrower) === normalizeSolanaAddress(walletFilterRaw);
        }

        // EVM is case-insensitive hex
        return borrower.toLowerCase() === walletFilterRaw.toLowerCase();
      }

      // Privacy mode: only return positions linked to this session (EVM wallets + vault).
      const chain = normalizeChain(item?.chain) || 'evm';
      if (chain === 'solana') {
        const borrower = normalizeWallet(item?.borrower);
        if (!borrower) return false;
        if (!sessionWallets.solana.has(borrower)) return false;
        if (!walletFilterRaw) return true;
        // Solana addresses are case-sensitive mixed-case base58
        const normalizedWf = normalizeSolanaAddress(walletFilterRaw);
        return borrower === (normalizedWf || walletFilterRaw);
      }

      const mode = String(item?.mode || '').toLowerCase();
      if (mode === 'private') {
        const vault = String(item?.vault || '').toLowerCase();
        if (!privacyVaultAddress || !vault) return false;
        if (vault !== privacyVaultAddress) return false;
        if (!walletFilterRaw) return true;
        // If wallet filter exists, accept either the vault address or any linked EVM wallet.
        const wf = walletFilterRaw.toLowerCase();
        return wf === privacyVaultAddress || sessionWallets.evm.has(wf);
      }

      const borrower = normalizeWallet(item?.borrower).toLowerCase();
      if (!borrower) return false;
      if (!sessionWallets.evm.has(borrower)) return false;
      if (!walletFilterRaw) return true;
      return borrower === walletFilterRaw.toLowerCase();
    });
  };

  const queryChainId = req.query?.chainId ? Number(req.query.chainId) : 11155111;

  const fetchDynamicStreams = async () => {
    const solWallets = new Set(sessionWallets.solana);
    const evmWallets = new Set(sessionWallets.evm);
    if (walletFilterRaw) {
      const parsedSol = normalizeSolanaAddress(walletFilterRaw);
      if (parsedSol) solWallets.add(parsedSol);
      else evmWallets.add(walletFilterRaw);
    }

    let streams = [];
    if (solWallets.size > 0 || evmWallets.size > 0) {
      try {
        const wallets = Array.from(new Set([...Array.from(solWallets), ...Array.from(evmWallets)]));
        const allStreams = await Promise.all(
          wallets.map(w => vestingOracle.fetchAndEnqueue(w, 'all'))
        );
        const flatStreams = allStreams.flat();
        
        const mappedStreams = flatStreams.map(pos => {
          const isSolana = pos.chain === 'solana';
          return {
            loanId: pos.id,
            borrower: pos.wallet,
            principal: '0',
            interest: '0',
            collateralId: pos.id,
            unlockTime: pos.unlockTime,
            active: pos.isVested,
            token: pos.tokenAddress,
            tokenSymbol: pos.token,
            tokenDecimals: 18,
            quantity: pos.amount,
            pv: '0',
            ltvBps: '0',
            daysToUnlock: pos.unlockTime ? Math.max(0, Math.round((pos.unlockTime * 1000 - Date.now()) / 86400000)) : null,
            chain: pos.chain,
            network: isSolana ? 'mainnet' : (pos.chainId === 11155111 ? 'sepolia' : pos.chainId === 8453 ? 'base' : 'asi'),
            streamId: pos.id,
            program: pos.protocol,
            evidence: {
              escrowTx: '',
              wallet: '',
              token: ''
            }
          };
        });
        streams = streams.concat(mappedStreams);
      } catch (e) {
        console.warn('[VestingOracle] Error fetching dynamic streams:', e.message);
      }
    }
    return streams;
  };

  const now = Date.now();
  if (cachedVestedContracts.length && now - cachedVestedContractsAt < VESTED_CACHE_TTL_MS) {
    try {
      const dynamicStreams = await fetchDynamicStreams();
      const filteredItems = await filterItems([...cachedVestedContracts, ...dynamicStreams]);
      const redacted = privacyRequested
        ? filteredItems.map((item) => {
          const { borrower, vault, ...rest } = item || {};
          return {
            ...rest,
            // Also remove wallet evidence link which can deanonymize in UI copies.
            evidence: rest?.evidence ? { ...rest.evidence, wallet: '' } : rest?.evidence
          };
        })
        : filteredItems;
      res.json({
        ok: true,
        items: sanitizeForJson(redacted),
        cached: true,
        cachedAt: cachedVestedContractsAt
      });
      return;
    } catch (error) {
      return res.status(error.statusCode || 500).json({ ok: false, error: error?.message || 'error', items: [] });
    }
  }
  try {
    if (!vestedContractsInFlight) {
      vestedContractsInFlight = (async () => {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('Vested contracts fetch timed out')),
            VESTED_FETCH_TIMEOUT_MS
          );
        });
        return Promise.race([getVestedContracts(), timeoutPromise]);
      })();
    }
    const items = await vestedContractsInFlight;
    cachedVestedContracts = items;
    cachedVestedContractsAt = Date.now();
    const dynamicStreams = await fetchDynamicStreams();
    const filteredItems = await filterItems([...items, ...dynamicStreams]);
    const redacted = privacyRequested
      ? filteredItems.map((item) => {
        const { borrower, vault, ...rest } = item || {};
        return {
          ...rest,
          evidence: rest?.evidence ? { ...rest.evidence, wallet: '' } : rest?.evidence
        };
      })
      : filteredItems;
    res.json({
      ok: true,
      items: sanitizeForJson(redacted),
      cached: false,
      cachedAt: cachedVestedContractsAt
    });
  } catch (error) {
    if (cachedVestedContracts.length) {
      try {
        const dynamicStreams = await fetchDynamicStreams();
        const filteredItems = await filterItems([...cachedVestedContracts, ...dynamicStreams]);
        const redacted = privacyRequested
          ? filteredItems.map((item) => {
            const { borrower, vault, ...rest } = item || {};
            return {
              ...rest,
              evidence: rest?.evidence ? { ...rest.evidence, wallet: '' } : rest?.evidence
            };
          })
          : filteredItems;
        res.json({
          ok: true,
          items: sanitizeForJson(redacted),
          cached: true,
          cachedAt: cachedVestedContractsAt,
          error: error?.message || 'error'
        });
        return;
      } catch (inner) {
        return res.status(inner.statusCode || 500).json({ ok: false, error: inner?.message || 'error', items: [] });
      }
    }
    res.status(200).json({
      ok: false,
      error: error?.message || 'error',
      items: []
    });
  } finally {
    vestedContractsInFlight = null;
  }
});

app.get('/api/vested-snapshots', (req, res) => {
  const includeItems = req.query?.full === '1';
  const snapshots = includeItems
    ? vestedSnapshots
    : vestedSnapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      summary: snapshot.summary
    }));
  res.json({ ok: true, snapshots });
});

app.get('/api/solana/unmapped-mints', (_req, res) => {
  res.json({ ok: true, items: getUnmappedMints() });
});

app.get('/api/solana/status', (_req, res) => {
  const streamflowEnabled = process.env.SOLANA_STREAMFLOW_ENABLED === 'true';
  const clusterRaw = String(process.env.SOLANA_CLUSTER || 'mainnet').toLowerCase();
  const cluster = clusterRaw.startsWith('dev')
    ? 'devnet'
    : clusterRaw.startsWith('test')
      ? 'testnet'
      : clusterRaw.startsWith('local')
        ? 'local'
        : 'mainnet';
  res.json({
    ok: true,
    status: {
      streamflowEnabled,
      cluster
    }
  });
});

app.get('/api/solana/repay-config', (_req, res) => {
  res.json({ ok: true, config: getRepayConfig() });
});

app.post('/api/solana/repay-plan', requireSession, requireAdmin, validateBody(solanaRepaySchema), async (req, res) => {
  try {
    const owner = req.body.owner;
    const maxUsdc = req.body.maxUsdc;
    const plan = await buildRepayPlan({ owner, maxUsdc });
    res.json({ ok: true, plan });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'repay plan error'
    });
  }
});

app.post('/api/solana/repay-sweep', requireSession, validateBody(solanaRepaySchema), async (req, res) => {
  try {
    const owner = req.body.owner;
    const maxUsdc = req.body.maxUsdc;
    const sessionWallet = req.user?.walletAddress;

    // P0: Enforce req.user.walletAddress === owner check (or admin-only fallback)
    const isAdmin = req.user?.isAdmin || false;
    if (!isAdmin && sessionWallet !== owner) {
      console.warn(`[security] Unauthorized sweep attempt by ${sessionWallet} for owner ${owner}`);
      return res.status(403).json({ ok: false, error: 'Unauthorized: Only owner or admin can trigger sweep' });
    }

    console.log(`[audit] Repay sweep initiated by ${sessionWallet} for ${owner} (maxUsdc: ${maxUsdc || 'unlimited'})`);
    
    const result = await executeRepaySweep({ owner, maxUsdc });
    
    if (result.ok) {
      console.log(`[audit] Repay sweep successful for ${owner}. Signature: ${result.signature}`);
    } else {
      console.warn(`[audit] Repay sweep failed for ${owner}: ${result.error}`);
    }

    res.json(result);
  } catch (error) {
    console.error(`[audit] Repay sweep error for ${req.body.owner}:`, error.message);
    res.status(200).json({
      ok: false,
      error: error?.message || 'repay sweep error'
    });
  }
});

const solanaRepayJobSchema = z.object({
  owner: z.string().trim().min(3),
  maxUsdc: z.string().trim().optional().nullable()
});

app.post(
  '/api/solana/repay-jobs/enqueue',
  requireSession,
  requireAdmin,
  validateBody(solanaRepayJobSchema),
  async (req, res) => {
    try {
      const ownerRaw = String(req.body.owner || '').trim();
      // Validate early so the worker doesn't repeatedly fail.
      const owner = new PublicKey(ownerRaw).toString();
      const maxUsdc = req.body.maxUsdc ? String(req.body.maxUsdc).trim() : null;
      const job = await persistence.createRepayJob({
        chainType: 'solana',
        ownerWallet: owner,
        maxUsdc
      });
      res.json({ ok: true, job });
    } catch (error) {
      res.status(200).json({
        ok: false,
        error: error?.message || 'enqueue repay job error'
      });
    }
  }
);

app.get('/api/exports/repay-schedule', expensiveLimiter, requireSession, async (_req, res) => {
  const exportsAdminOnly = process.env.EXPORTS_ADMIN_ONLY === 'true';
  const ipAllowlist = String(process.env.EXPORTS_IP_ALLOWLIST || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (ipAllowlist.length) {
    const ip = getClientIp(_req) || '';
    if (!ipAllowlist.includes(ip)) {
      return res.status(403).json({ ok: false, error: 'Export blocked by IP allowlist' });
    }
  }
  if (exportsAdminOnly) {
    const isAdmin =
      String(_req.user?.role || '').toLowerCase() === 'admin' ||
      isAdminWallet(_req.user?.walletAddress);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: 'Admin access required' });
    }
  }
  try {
    const rowsData = await fetchRepayScheduleRows();
    const watermark = `exported_at=${new Date().toISOString()} user=${String(_req.user?.id || '').slice(0, 8)}`;
    const rows = [['Loan ID', 'Mode', 'Principal', 'Interest', 'Unlock', 'Status', 'Watermark']];
    for (const loan of rowsData) {
      rows.push([
        loan.loanId,
        loan.mode || '',
        loan.principal,
        loan.interest,
        loan.unlockTime ? new Date(Number(loan.unlockTime) * 1000).toISOString() : '',
        loan.status,
        watermark
      ]);
    }
    const csv = rows.map((row) => row.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="vestra-repayment-schedule.csv"'
    );
    res.send(csv);
  } catch (error) {
    const watermark = `exported_at=${new Date().toISOString()} user=${String(_req.user?.id || '').slice(0, 8)}`;
    const rows = [
      ['Loan ID', 'Mode', 'Principal', 'Interest', 'Unlock', 'Status', 'Watermark'],
      ...cachedRepaySchedule.map((loan) => [
        loan.loanId,
        loan.mode || '',
        loan.principal,
        loan.interest,
        loan.unlockTime ? new Date(loan.unlockTime * 1000).toISOString() : '',
        loan.status,
        watermark
      ])
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="vestra-repayment-schedule.csv"'
    );
    res.send(csv);
  }
});

const runSolanaRepayJobsTick = async () => {
  if (solanaRepayJobsInFlight) return;
  if (!SOLANA_REPAY_JOBS_ENABLED) return;
  if (process.env.SOLANA_REPAY_ENABLED !== 'true') return;
  solanaRepayJobsInFlight = true;
  try {
    const pending = await persistence.listPendingRepayJobs({
      chainType: 'solana',
      limit: SOLANA_REPAY_JOBS_MAX_PER_TICK
    });
    for (const job of pending) {
      try {
        await persistence.updateRepayJob({ id: job.id, status: 'running', lastError: null });
        const result = await executeRepaySweep({
          owner: job.ownerWallet,
          maxUsdc: job.maxUsdc || null
        });
        if (!result?.ok) {
          await persistence.updateRepayJob({
            id: job.id,
            status: 'failed',
            lastError: result?.error || 'sweep failed'
          });
          continue;
        }
        await persistence.updateRepayJob({ id: job.id, status: 'completed', lastError: null });
      } catch (error) {
        await persistence.updateRepayJob({
          id: job.id,
          status: 'failed',
          lastError: error?.message || String(error)
        });
      }
    }
  } catch (error) {
    console.error('[solana-repay-jobs] tick failed', error?.message || error);
  } finally {
    solanaRepayJobsInFlight = false;
  }
};

const getKeeperCandidates = async ({ loanCount }) => {
  const total = Number(loanCount || 0);
  if (!Number.isFinite(total) || total <= 0) return [];
  const candidates = new Set();

  // 1) Always scan the most recent N loans.
  if (EVM_KEEPER_RECENT_SCAN > 0) {
    const start = Math.max(0, total - EVM_KEEPER_RECENT_SCAN);
    for (let i = start; i < total; i++) candidates.add(i);
  }

  // 2) Also scan a rotating window so older loans don't get starved.
  if (EVM_KEEPER_ROTATING_SCAN > 0) {
    const cursorRaw = await persistence.getMeta('evmKeeperCursor');
    let cursor = cursorRaw === null ? 0 : Number(cursorRaw);
    if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;
    if (cursor >= total) cursor = 0;
    const end = Math.min(total, cursor + EVM_KEEPER_ROTATING_SCAN);
    for (let i = cursor; i < end; i++) candidates.add(i);
    const nextCursor = end >= total ? 0 : end;
    await persistence.setMeta('evmKeeperCursor', String(nextCursor));
  }

  return Array.from(candidates.values()).sort((a, b) => a - b);
};

const runEvmSettlementKeeperTick = async () => {
  if (evmKeeperInFlight) return;
  if (!EVM_KEEPER_ENABLED) return;
  if (!EVM_KEEPER_PRIVATE_KEY) {
    // Don't spam logs; this is a configuration error.
    if (!runEvmSettlementKeeperTick._warned) {
      runEvmSettlementKeeperTick._warned = true;
      console.warn('[evm-keeper] enabled but missing EVM_KEEPER_PRIVATE_KEY');
    }
    return;
  }
  evmKeeperInFlight = true;
  try {
    const signer = new ethers.Wallet(EVM_KEEPER_PRIVATE_KEY, provider);
    const loanManagerWrite = new ethers.Contract(
      loanManager.address,
      loanManagerDeployment.abi,
      signer
    );

    const loanCount = await loanManagerWrite.loanCount();
    const candidates = await getKeeperCandidates({ loanCount });
    if (!candidates.length) return;

    const now = Math.floor(Date.now() / 1000);
    let txSent = 0;

    for (const id of candidates) {
      if (txSent >= EVM_KEEPER_MAX_TX_PER_TICK) break;

      let loan;
      try {
        loan = await loanManagerWrite.loans(id);
      } catch {
        continue;
      }
      const active = Boolean(loan?.active);
      const unlockTime = Number(loan?.unlockTime || 0);
      if (!active) continue;
      if (!unlockTime || unlockTime > now) continue;

      try {
        // `settleAtUnlock` is permissionless; keeper makes it automatic.
        const tx = await loanManagerWrite.settleAtUnlock(id);
        txSent += 1;
        await tx.wait(1);
        console.log(`[evm-keeper] settled loan ${id} tx=${tx.hash}`);
      } catch (error) {
        const msg = error?.shortMessage || error?.reason || error?.message || String(error);
        // Common revert reasons are fine (race conditions with another settler).
        if (msg.includes('inactive') || msg.includes('not unlocked') || msg.includes('paused')) {
          continue;
        }
        console.warn(`[evm-keeper] settle failed loan ${id}:`, msg);
      }
    }
  } catch (error) {
    console.error('[evm-keeper] tick failed', error?.message || error);
  } finally {
    evmKeeperInFlight = false;
  }
};



const runEvmRepayKeeperTick = async () => {
  if (evmRepayKeeperInFlight) return;
  if (!EVM_REPAY_KEEPER_ENABLED) return;
  if (!EVM_KEEPER_PRIVATE_KEY) {
    if (!runEvmRepayKeeperTick._warned) {
      runEvmRepayKeeperTick._warned = true;
      console.warn('[evm-repay-keeper] enabled but missing EVM_KEEPER_PRIVATE_KEY');
    }
    return;
  }
  evmRepayKeeperInFlight = true;
  try {
    const signer = new ethers.Wallet(EVM_KEEPER_PRIVATE_KEY, provider);
    const loanManagerWrite = new ethers.Contract(
      loanManager.address,
      loanManagerDeployment.abi,
      signer
    );
    const usdcAddress = String(await loanManagerWrite.usdc()).toLowerCase();

    const loanCount = await loanManagerWrite.loanCount();
    const candidates = await getKeeperCandidates({ loanCount });
    if (!candidates.length) return;

    const repayTokens = await loanManagerWrite.getRepayTokenPriority();
    const tokenList = Array.isArray(repayTokens) ? repayTokens : [];
    if (!tokenList.length) return;

    const now = Math.floor(Date.now() / 1000);
    let txSent = 0;

    for (const id of candidates) {
      if (txSent >= EVM_REPAY_KEEPER_MAX_TX_PER_TICK) break;

      let loan;
      try {
        loan = await loanManagerWrite.loans(id);
      } catch {
        continue;
      }

      const active = Boolean(loan?.active);
      const borrower = loan?.borrower;
      const unlockTime = Number(loan?.unlockTime || 0);
      if (!active || !borrower) continue;
      if (!unlockTime) continue;
      if (unlockTime > now + EVM_REPAY_KEEPER_LOOKAHEAD_SECONDS) continue;

      let optedIn = false;
      try {
        optedIn = await loanManagerWrite.autoRepayOptIn(borrower);
      } catch {
        optedIn = false;
      }
      if (!optedIn) continue;

      let remainingDebt = 0n;
      try {
        remainingDebt = await loanManagerWrite.getRemainingDebt(id);
      } catch {
        remainingDebt = 0n;
      }
      if (remainingDebt <= 0n) continue;

      const tokens = [];
      const amounts = [];
      const minOuts = [];

      for (const token of tokenList.slice(0, EVM_REPAY_KEEPER_MAX_TOKENS_PER_LOAN)) {
        if (remainingDebt <= 0n) break;
        if (!token || token === ethers.ZeroAddress) continue;

        const tokenContract = new ethers.Contract(token, erc20ReadAbi, provider);
        let balance = 0n;
        let allowance = 0n;
        try {
          balance = await tokenContract.balanceOf(borrower);
          allowance = await tokenContract.allowance(borrower, loanManager.address);
        } catch {
          continue;
        }
        const spendable = balance < allowance ? balance : allowance;
        if (spendable <= 0n) continue;

        let amountIn = spendable;
        if (String(token).toLowerCase() === usdcAddress) {
          amountIn = spendable > remainingDebt ? remainingDebt : spendable;
        } else {
          // Use an oracle-based estimate to avoid seizing more value than needed.
          // This is best-effort; contract-side refund prevents USDC over-application,
          // but we still prefer not to swap excess token value.
          try {
            const minOut = await loanManagerWrite.quoteMinUsdcOut(token, spendable);
            // If swapping entire balance would exceed remaining debt, scale down proportionally.
            if (minOut > remainingDebt && minOut > 0n) {
              amountIn = (spendable * remainingDebt) / minOut;
              // Add small buffer for rounding.
              amountIn = (amountIn * 10200n) / 10000n;
              if (amountIn > spendable) amountIn = spendable;
              if (amountIn <= 0n) continue;
            }
          } catch {
            // If we can't quote, skip token (safer than swapping blind).
            continue;
          }
        }

        let minOut;
        try {
          minOut = await loanManagerWrite.quoteMinUsdcOut(token, amountIn);
        } catch {
          continue;
        }

        tokens.push(token);
        amounts.push(amountIn);
        minOuts.push(minOut);

        // We don't update remainingDebt precisely here (swap output varies). This is a
        // single-shot best-effort; subsequent ticks will continue if needed.
      }

      if (!tokens.length) continue;

      try {
        const tx = await loanManagerWrite.repayWithSwapBatchFor(id, tokens, amounts, minOuts);
        txSent += 1;
        await tx.wait(1);
        console.log(`[evm-repay-keeper] repay tx loan ${id} tx=${tx.hash}`);
      } catch (error) {
        const msg = error?.shortMessage || error?.reason || error?.message || String(error);
        if (msg.includes('inactive') || msg.includes('paused') || msg.includes('auto repay disabled')) {
          continue;
        }
        console.warn(`[evm-repay-keeper] repay failed loan ${id}:`, msg);
      }
    }
  } catch (error) {
    console.error('[evm-repay-keeper] tick failed', error?.message || error);
  } finally {
    evmRepayKeeperInFlight = false;
  }
};

const { generateMetadata } = require('./lib/metadata');

app.post('/api/loans/ipfs-metadata', async (req, res) => {
  try {
    const metadata = generateMetadata(req.body);
    const uri = await uploadJSONToIPFS(metadata);
    res.json({ ok: true, uri, metadata });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || 'IPFS upload failed' });
  }
});

// ─── Scanner: Multi-chain wallet portfolio aggregator ─────────────────────────
const scannerRouter = require('./routes/scanner');
const faucetRouter = require('./routes/faucet');
const vestingRouter = require('./routes/vesting');
const portfolioRouter = require('./routes/portfolio');

// Expose the SQLite/Supabase db handle to the scanner router via app.locals
app.use('/api/scanner', (req, _res, next) => {
  const db = persistence.getSqlite?.() || null;
  req.app.locals.db = db;
  next();
}, scannerRouter);

app.use('/api/faucet', faucetRouter);
app.use('/api/vesting', vestingRouter);
app.use('/api/portfolio', portfolioRouter);

const start = async () => {
  try {
    await initPersistence();
    console.log(
      `[persistence] using ${persistence.useSupabase ? 'Supabase' : 'local SQLite'}`
    );
  } catch (error) {
    console.warn('[bootstrap] persistence init failed (non-fatal, continuing):', error?.message || error);
    // Non-fatal: the server starts in degraded mode with SQLite fallback.
    // This prevents Supabase timeouts from killing the process.
  }

  app.post('/api/asi/deploy-token', async (req, res) => {
    const { name, symbol, supply, owner } = req.body;
    if (!name || !symbol || !supply || !owner) return res.status(400).json({ error: 'Missing parameters' });
    
    const result = await rnodeService.deployToken({ name, symbol, supply, owner });
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  });

  app.post('/api/asi/create-vesting', async (req, res) => {
    const { beneficiary, amount, unlockBlock } = req.body;
    if (!beneficiary || !amount || !unlockBlock) return res.status(400).json({ error: 'Missing parameters' });
    
    const result = await rnodeService.deployVesting({ beneficiary, amount, unlockBlock });
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  });

  app.post('/api/asi/swap', async (req, res) => {
    const { fromAddress, amountAsi } = req.body;
    if (!fromAddress || !amountAsi) return res.status(400).json({ error: 'Missing parameters' });
    
    // Simulate a swap: User "burns/sends" ASI, and we credit them USDC on DevNet
    // For the demo, we return a success with the amount of USDC received
    const usdcEquivalent = Number(amountAsi) * 1.5; // Simulate a rate
    
    res.json({
      success: true,
      txHash: `rho:tx:${Math.random().toString(16).substring(2, 20)}`,
      receivedUsdc: usdcEquivalent.toFixed(2),
      message: `Swapped ${amountAsi} ASI for ${usdcEquivalent.toFixed(2)} test USDC on DevNet.`
    });
  });

  // Initialize Services first
  const relayer = getRelayerWallet();
  const valuationContract = new ethers.Contract(valuationEngine.address, valuationDeployment.abi, relayer);
  
  relayerService = new RelayerService(persistence);
  
  const loanManagerContract = new ethers.Contract(loanManager.address, loanManagerDeployment.abi, relayer);
  const poolContract = new ethers.Contract(lendingPool.address, lendingPoolDeployment.abi, relayer);
  
  loanExecutionService = new LoanExecutionService(provider, relayer, {
      loanManager: loanManagerContract,
      valuationEngine: valuationContract,
      wrapperNFT: new ethers.Contract(vestingAdapter.address, vestingAdapterDeployment.abi, relayer)
  });

  lendingService = new LendingService(provider, {
      pool: poolContract
  });

  indexerService = new IndexerService(provider, persistence, {
      valuation: valuationContract,
      adapter: new ethers.Contract(vestingAdapter.address, vestingAdapterDeployment.abi, relayer),
      pool: poolContract,
      loanManager: loanManagerContract
  }, {
      lookbackBlocks: INDEXER_LOOKBACK_BLOCKS,
      pollInterval: INDEXER_POLL_INTERVAL_MS,
      maxBlocksPerPoll: INDEXER_MAX_BLOCKS_PER_POLL,
      maxEvents: INDEXER_MAX_EVENTS
  });
  omegaService = new OmegaService({
      defaultVolatility: 10,
      defaultInterestRateBps: 800
  });
  airdropService = new AirdropService(persistence);

  // await indexerService.init().catch(e => console.error('[indexer] init failed', e));
  await omegaService.init(valuationContract).catch(e => console.error('[omega] init failed', e));

  app.listen(port, async () => {
    console.log(`Vestra backend running on http://localhost:${port}`);
    
    // Start price history cache (backfill and loop)
    priceHistoryCache.start().catch((err) => {
      console.error('[PriceCache] Start failed:', err);
    });

    // Privacy hardening: periodically purge sensitive data (SQLite mode).
    try {
      persistence.purgeSensitiveData?.().catch?.(() => { });
      const intervalMs = Math.max(
        60_000,
        Number(process.env.PRIVACY_PURGE_INTERVAL_MS || 60 * 60 * 1000)
      );
      setInterval(() => {
        persistence.purgeSensitiveData?.().catch?.((error) => {
          console.warn('[privacy] purge failed', error?.message || error);
        });
      }, intervalMs);
    } catch (_) { }

    if (INDEXER_ENABLED) {
      indexerService.poll().catch((error) =>
        console.error('[indexer] initial poll error', error?.message || error)
      );
      setInterval(() => {
        indexerService.poll().catch((error) =>
          console.error('[indexer] poll error (interval)', error?.message || error)
        );
      }, DEMO_MODE ? Math.max(INDEXER_POLL_INTERVAL_MS * 4, 60000) : INDEXER_POLL_INTERVAL_MS);
    } else {
      console.log('[indexer] disabled via INDEXER_ENABLED=false');
    }

    if (EVM_KEEPER_ENABLED) {
      runEvmSettlementKeeperTick().catch((error) =>
        console.error('[evm-keeper] initial tick error', error?.message || error)
      );
      setInterval(() => {
        runEvmSettlementKeeperTick().catch((error) =>
          console.error('[evm-keeper] tick error (interval)', error?.message || error)
        );
      }, Math.max(5000, EVM_KEEPER_INTERVAL_MS));
      console.log('[evm-keeper] enabled');
    }

    if (SOLANA_REPAY_JOBS_ENABLED) {
      runSolanaRepayJobsTick().catch((error) =>
        console.error('[solana-repay-jobs] initial tick error', error?.message || error)
      );
      setInterval(() => {
        runSolanaRepayJobsTick().catch((error) =>
          console.error('[solana-repay-jobs] tick error (interval)', error?.message || error)
        );
      }, Math.max(5000, SOLANA_REPAY_JOBS_INTERVAL_MS));
      console.log('[solana-repay-jobs] enabled');
    }

    if (EVM_REPAY_KEEPER_ENABLED) {
      runEvmRepayKeeperTick().catch((error) =>
        console.error('[evm-repay-keeper] initial tick error', error?.message || error)
      );
      setInterval(() => {
        runEvmRepayKeeperTick().catch((error) =>
          console.error('[evm-repay-keeper] tick error (interval)', error?.message || error)
        );
      }, Math.max(5000, EVM_REPAY_KEEPER_INTERVAL_MS));
      console.log('[evm-repay-keeper] enabled');
    }

    // Sovereign Mirror Relayer Activation
    /*
    sovereignRelayer.start().catch((error) =>
      console.error('[sovereign-relayer] startup error', error?.message || error)
    );
    */
  });
};

start().catch((error) => {
  console.error('[startup] fatal', error?.message || error);
  process.exit(1);
});
