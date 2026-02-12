const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { fetch } = require('undici');
const fs = require('fs');
const { ethers } = require('ethers');
const { z } = require('zod');
const { initAgent, answerAgent } = require('./agent');
const persistence = require('./persistence');
const {
  fetchStreamflowVestingContracts,
  getUnmappedMints
} = require('./solana/streamflow');
const {
  getRepayConfig,
  buildRepayPlan,
  executeRepaySweep
} = require('./solana/repay');

const app = express();
const port = process.env.PORT || 4000;

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
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 60);
const NONCE_TTL_MINUTES = Number(process.env.NONCE_TTL_MINUTES || 10);
const GEO_LOOKUP_URL = process.env.GEO_LOOKUP_URL || 'https://ipapi.co';
const GEO_LOOKUP_TIMEOUT_MS = Number(process.env.GEO_LOOKUP_TIMEOUT_MS || 2200);
const GEO_CACHE_TTL_MS = Number(process.env.GEO_CACHE_TTL_MS || 24 * 60 * 60 * 1000);

const provider = new ethers.JsonRpcProvider(RPC_URL);
const agent = initAgent();
const blockCache = new Map();
const activityEvents = [];
const seenEvents = new Set();
let lastIndexedBlock = null;
let latestChainBlock = null;
let lastPollAt = 0;
let cachedRepaySchedule = [];
let lastScheduleRefresh = 0;
const vestedSnapshots = [];
let cachedVestedContracts = [];
let cachedVestedContractsAt = 0;
const geoLookupCache = new Map();

const withTimeout = (promise, ms, fallback) =>
  Promise.race([
    promise,
    new Promise((resolve) =>
      setTimeout(() => resolve(fallback), Math.max(0, ms))
    )
  ]);

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
  const persistedLastIndexed = await persistence.getMeta('lastIndexedBlock');
  if (persistedLastIndexed !== null) {
    lastIndexedBlock = Number(persistedLastIndexed);
  }
  await loadPersistedEvents();
  await loadPersistedSnapshots();
};

const DEPLOYMENTS_NETWORK = process.env.DEPLOYMENTS_NETWORK || 'sepolia';

const loadDeployment = (name) => {
  const filePath = path.join(
    __dirname,
    '..',
    'deployments',
    DEPLOYMENTS_NETWORK,
    `${name}.json`
  );
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed;
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

const erc20Abi = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

const getEventTopic = (iface, name) => {
  try {
    return iface.getEvent(name).topicHash;
  } catch (error) {
    return null;
  }
};

const normalizeEvent = async (log) => {
  const parsed = loanManager.iface.parseLog(log);
  const blockNumber = Number(log.blockNumber);
  let timestamp = blockCache.get(blockNumber);
  if (!timestamp) {
    const block = await provider.getBlock(blockNumber);
    timestamp = block?.timestamp || 0;
    blockCache.set(blockNumber, timestamp);
  }
  const base = {
    txHash: log.transactionHash,
    logIndex: Number(log.logIndex),
    blockNumber,
    timestamp
  };
  if (parsed.name === 'LoanCreated') {
    return {
      ...base,
      type: 'LoanCreated',
      loanId: parsed.args.loanId.toString(),
      borrower: parsed.args.borrower,
      amount: parsed.args.amount.toString()
    };
  }
  if (parsed.name === 'LoanRepaid') {
    return {
      ...base,
      type: 'LoanRepaid',
      loanId: parsed.args.loanId.toString(),
      amount: parsed.args.amount.toString()
    };
  }
  if (parsed.name === 'LoanRepaidWithSwap') {
    return {
      ...base,
      type: 'LoanRepaidWithSwap',
      loanId: parsed.args.loanId.toString(),
      amount: parsed.args.usdcReceived?.toString?.() || '0',
      tokenIn: parsed.args.tokenIn,
      amountIn: parsed.args.amountIn?.toString?.() || '0'
    };
  }
  if (parsed.name === 'LoanSettled') {
    return {
      ...base,
      type: 'LoanSettled',
      loanId: parsed.args.loanId.toString(),
      defaulted: Boolean(parsed.args.defaulted)
    };
  }
  return null;
};

const pushEvents = async (events) => {
  const newEvents = [];
  events.forEach((event) => {
    if (!event) return;
    const key = `${event.txHash}-${event.logIndex}`;
    if (seenEvents.has(key)) return;
    seenEvents.add(key);
    activityEvents.push(event);
    newEvents.push(event);
  });
  if (newEvents.length) {
    await persistence.saveEvents(newEvents);
  }
  activityEvents.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return b.blockNumber - a.blockNumber;
    }
    return b.logIndex - a.logIndex;
  });
  if (activityEvents.length > INDEXER_MAX_EVENTS) {
    activityEvents.splice(INDEXER_MAX_EVENTS);
  }
};

const is429 = (err) =>
  (err?.message || String(err)).includes('429') ||
  (err?.info?.error?.code === 429);

const getLogsWithRetry = async (params) => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await provider.getLogs(params);
    } catch (err) {
      if (attempt < maxAttempts && is429(err)) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
};

const pollEvents = async () => {
  try {
    const latestBlock = await provider.getBlockNumber();
    latestChainBlock = latestBlock;
    lastPollAt = Date.now();
    if (lastIndexedBlock === null) {
      lastIndexedBlock = Math.max(latestBlock - INDEXER_LOOKBACK_BLOCKS, 0);
    }
    const startBlock = lastIndexedBlock + 1;
    if (startBlock > latestBlock) {
      return;
    }
    const chunkSize = 10;
    for (let from = startBlock; from <= latestBlock; from += chunkSize) {
      const to = Math.min(from + chunkSize - 1, latestBlock);
      const loanCreatedTopic = getEventTopic(loanManager.iface, 'LoanCreated');
      const loanRepaidTopic = getEventTopic(loanManager.iface, 'LoanRepaid');
      const loanRepaidSwapTopic = getEventTopic(loanManager.iface, 'LoanRepaidWithSwap');
      const loanSettledTopic = getEventTopic(loanManager.iface, 'LoanSettled');

      const logParams = (topic) =>
        topic ? { address: loanManager.address, fromBlock: from, toBlock: to, topics: [topic] } : null;
      const loanCreatedLogs = logParams(loanCreatedTopic)
        ? await getLogsWithRetry(logParams(loanCreatedTopic))
        : [];
      const loanRepaidLogs = logParams(loanRepaidTopic)
        ? await getLogsWithRetry(logParams(loanRepaidTopic))
        : [];
      const loanRepaidSwapLogs = logParams(loanRepaidSwapTopic)
        ? await getLogsWithRetry(logParams(loanRepaidSwapTopic))
        : [];
      const loanSettledLogs = logParams(loanSettledTopic)
        ? await getLogsWithRetry(logParams(loanSettledTopic))
        : [];

      const normalized = await Promise.all(
        [
          ...loanCreatedLogs,
          ...loanRepaidLogs,
          ...loanRepaidSwapLogs,
          ...loanSettledLogs
        ].map(normalizeEvent)
      );
      await pushEvents(normalized.filter(Boolean));
    }
    lastIndexedBlock = latestBlock;
    await persistence.setMeta('lastIndexedBlock', lastIndexedBlock);
  } catch (error) {
    console.error('[indexer] poll error', error?.message || error);
  }
};

const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = corsOrigins.length
  ? { origin: corsOrigins, credentials: true }
  : null;
app.use(corsOptions ? cors(corsOptions) : cors());

const jsonLimit = process.env.JSON_BODY_LIMIT || '200kb';
app.use(express.json({ limit: jsonLimit }));

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value, maxLen) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
};

const normalizeEmail = (value, maxLen) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().slice(0, maxLen);
};

const toNumber = (value, fallback = 0) => {
  const num = typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toBigIntSafe = (value) => {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.floor(value));
    return BigInt(value);
  } catch {
    return 0n;
  }
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
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || '';
};

const hashIp = (ip) => {
  if (!ip) return '';
  return crypto.createHash('sha256').update(ip).digest('hex');
};

const isPrivateOrLocalIp = (ip) => {
  if (!ip) return true;
  const normalized = ip.replace(/^::ffff:/, '');
  if (
    normalized === '::1' ||
    normalized === '127.0.0.1' ||
    normalized === 'localhost'
  ) {
    return true;
  }
  if (
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return true;
  }
  return false;
};

const readGeoFromProvider = async (ip) => {
  const url = `${GEO_LOOKUP_URL.replace(/\/$/, '')}/${encodeURIComponent(ip)}/json/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const lat = Number(data?.latitude);
    const lng = Number(data?.longitude);
    const city = data?.city ? String(data.city).trim() : '';
    const state = data?.region ? String(data.region).trim() : null;
    const country = data?.country_name
      ? String(data.country_name).trim()
      : data?.country
        ? String(data.country).trim()
        : '';
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !city || !country) {
      return null;
    }
    return { lat, lng, city, state, country };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const lookupGeoByIp = async (ip) => {
  if (!ip || isPrivateOrLocalIp(ip)) return null;
  const cacheKey = hashIp(ip);
  const cached = geoLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.at < GEO_CACHE_TTL_MS) {
    return cached.value;
  }
  const value = await readGeoFromProvider(ip);
  geoLookupCache.set(cacheKey, { at: Date.now(), value });
  return value;
};

const captureUserGeoPresence = async ({ userId, ip }) => {
  if (!userId || !ip) return;
  try {
    const geo = await lookupGeoByIp(ip);
    if (!geo) return;
    await persistence.upsertUserGeoPresence({
      userId,
      lat: geo.lat,
      lng: geo.lng,
      city: geo.city,
      state: geo.state,
      country: geo.country
    });
  } catch (error) {
    console.warn('[geo] capture failed', error?.message || error);
  }
};

const buildSessionFingerprint = (req) => {
  const token = getSessionToken(req);
  if (token) {
    return crypto.createHash('sha256').update(`token:${token}`).digest('hex');
  }
  const ip = getClientIp(req);
  if (ip) {
    return crypto.createHash('sha256').update(`ip:${ip}`).digest('hex');
  }
  return '';
};

const verifyTurnstile = async (req, res, next) => {
  if (TURNSTILE_BYPASS) return next();
  if (!TURNSTILE_SECRET_KEY) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[turnstile] bypassed: TURNSTILE_SECRET_KEY missing');
      return next();
    }
    return res.status(503).json({ ok: false, error: 'Turnstile not configured' });
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

const getSessionToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const tokenHeader = req.headers['x-session-token'];
  if (typeof tokenHeader === 'string' && tokenHeader.trim()) {
    return tokenHeader.trim();
  }
  return '';
};

const requireSession = async (req, res, next) => {
  const token = getSessionToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Session required' });
  }
  try {
    const session = await persistence.getSessionByToken(token);
    if (!session) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }
    if (session.expiresAt && Date.now() > session.expiresAt) {
      return res.status(401).json({ ok: false, error: 'Session expired' });
    }
    const ipHash = hashIp(getClientIp(req));
    if (session.ipHash && ipHash && session.ipHash !== ipHash) {
      return res.status(401).json({ ok: false, error: 'Session mismatch' });
    }
    req.user = session.user || null;
    return next();
  } catch (error) {
    console.error('[auth] session lookup failed', error?.message || error);
    return res.status(500).json({ ok: false, error: 'Session lookup failed' });
  }
};

const attachSession = async (req, _res, next) => {
  const token = getSessionToken(req);
  if (!token) return next();
  try {
    const session = await persistence.getSessionByToken(token);
    if (session && (!session.expiresAt || Date.now() <= session.expiresAt)) {
      req.user = session.user || null;
    }
  } catch (error) {
    console.warn('[auth] optional session failed', error?.message || error);
  }
  return next();
};

const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_STRICT_MAX || 8),
  standardHeaders: true,
  legacyHeaders: false
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CHAT_MAX || 6),
  standardHeaders: true,
  legacyHeaders: false
});

app.use(defaultLimiter);
app.use(requireJsonBody);
app.use(honeypotCheck);
app.use(attachSession);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vestra-backend' });
});

const stringField = (max) => z.string().trim().min(1).max(max);
const optionalString = (max) => z.string().trim().max(max).optional();
const optionalEmail = (max) =>
  z
    .preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().trim().max(max).email().optional()
    )
    .transform((value) => (value ? normalizeEmail(value, max) : undefined));
const optionalAddress = z
  .preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().optional()
  )
  .refine((value) => !value || ethers.isAddress(value), 'Invalid wallet address')
  .transform((value) => (value ? ethers.getAddress(value) : undefined));

const poolPreferencesSchema = z
  .object({
    riskTier: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
    maxLtvBps: z.number().int().min(0).max(10000).optional(),
    interestBps: z.number().int().min(0).max(4000).optional(),
    minLiquidityUsd: z.number().min(0).optional(),
    minWalletAgeDays: z.number().min(0).optional(),
    minVolumeUsd: z.number().min(0).optional(),
    unlockWindowDays: z
      .object({
        min: z.number().min(0).optional(),
        max: z.number().min(0).optional()
      })
      .optional(),
    tokenCategories: z.array(z.string().min(1).max(40)).max(20).optional(),
    allowedTokens: z.array(z.string().min(1).max(120)).max(50).optional(),
    allowedTokenTypes: z.array(z.string().min(1).max(60)).max(20).optional(),
    vestPreferences: z
      .object({
        cliffMinDays: z.number().min(0).optional(),
        cliffMaxDays: z.number().min(0).optional(),
        durationMinDays: z.number().min(0).optional(),
        durationMaxDays: z.number().min(0).optional(),
        vestTypes: z.array(z.string().min(1).max(40)).max(10).optional()
      })
      .optional(),
    chains: z.array(z.enum(['base', 'solana'])).max(2).optional(),
    maxLoanUsd: z.number().min(0).optional(),
    minLoanUsd: z.number().min(0).optional(),
    accessType: z.enum(['open', 'premium', 'community']).optional(),
    premiumToken: z.string().max(42).optional(),
    communityToken: z.string().max(42).optional(),
    description: z.string().max(500).optional()
  })
  .strip();

const createPoolSchema = z
  .object({
    name: stringField(120),
    chain: optionalString(40),
    preferences: poolPreferencesSchema.optional(),
    status: optionalString(40)
  })
  .strip();

const updatePoolSchema = z
  .object({
    preferences: poolPreferencesSchema,
    status: optionalString(40)
  })
  .strip();

const matchQuoteSchema = z
  .object({
    chain: z.enum(['base', 'solana']),
    desiredAmountUsd: z.number().positive(),
    collateralId: optionalString(200),
    vestingContract: optionalString(200),
    token: optionalString(200),
    quantity: z.union([z.string(), z.number()]).optional(),
    unlockTime: z.number().int().positive().optional(),
    streamId: optionalString(200),
    maxOffers: z.number().int().min(1).max(10).optional(),
    borrowerWallet: optionalAddress
  })
  .strip();

const matchAcceptSchema = z
  .object({
    offerId: stringField(120),
    poolId: stringField(120),
    chain: z.enum(['base', 'solana']),
    borrower: optionalAddress,
    collateralId: optionalString(200),
    desiredAmountUsd: z.number().positive(),
    terms: z.record(z.unknown()).optional()
  })
  .strip();

const walletNonceSchema = z
  .object({
    walletAddress: stringField(120)
  })
  .strip();

const walletVerifySchema = z
  .object({
    walletAddress: stringField(120),
    nonce: stringField(256),
    signature: stringField(500)
  })
  .strip();

const chatSchema = z
  .object({
    message: stringField(2000),
    history: z
      .array(
        z.object({
          role: stringField(32),
          content: stringField(2000)
        })
      )
      .max(10)
      .optional(),
    captchaToken: optionalString(2048)
  })
  .strip();

const analyticsSchema = z
  .object({
    event: stringField(120),
    page: optionalString(200),
    walletAddress: optionalAddress,
    properties: z.record(z.unknown()).optional()
  })
  .strip();

const notifySchema = z
  .object({
    email: optionalEmail(320),
    walletAddress: optionalAddress,
    channel: optionalString(120),
    payload: z.record(z.unknown()).optional(),
    captchaToken: optionalString(2048)
  })
  .strip();

const governanceSchema = z
  .object({
    email: optionalEmail(320),
    walletAddress: optionalAddress,
    message: optionalString(2000),
    captchaToken: optionalString(2048)
  })
  .strip()
  .refine(
    (value) => Boolean(value.email || value.walletAddress || value.message),
    'Provide email, wallet address, or message'
  );

const contactSchema = z
  .object({
    name: optionalString(120),
    email: optionalEmail(320),
    message: optionalString(2000),
    company: optionalString(120),
    walletAddress: optionalAddress,
    context: optionalString(500),
    captchaToken: optionalString(2048)
  })
  .strip()
  .refine(
    (value) => Boolean(value.email || value.message || value.walletAddress),
    'Provide email, wallet address, or message'
  );

const writeSchema = z
  .object({
    action: optionalString(120),
    payload: z.record(z.unknown()).optional()
  })
  .strip();

const docsOpenSchema = z
  .object({
    document: optionalString(200),
    section: optionalString(200)
  })
  .strip();

const buildWalletMessage = (walletAddress, nonce) => {
  return [
    'Vestra authentication request',
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued at: ${new Date().toISOString()}`,
    'Only sign if you trust this request.'
  ].join('\n');
};

const getDaysToUnlock = (unlockTime) => {
  if (!unlockTime) return null;
  const millis = Number(unlockTime) * 1000 - Date.now();
  return Math.max(0, Math.round(millis / 86400000));
};

const getPoolInterestBps = async () => {
  try {
    const contract = new ethers.Contract(
      lendingPool.address,
      lendingPoolDeployment.abi,
      provider
    );
    const rate = await contract.getInterestRateBps();
    return Number(rate);
  } catch {
    return 800;
  }
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
  borrowerWallet
}) => {
  const daysToUnlock = getDaysToUnlock(unlockTime);
  const results = [];
  for (const pool of pools) {
    const prefs = normalizePoolPreferences(pool);
    if (prefs.chains.length && !prefs.chains.includes(chain)) continue;
    const maxLtv = prefs.maxLtvBps || ltvBps;
    const effectiveLtv = Math.min(maxLtv, ltvBps || maxLtv || 0);
    const maxBorrowUsd = pvUsd > 0 && effectiveLtv > 0 ? (pvUsd * effectiveLtv) / 10000 : 0;
    if (prefs.minLoanUsd && desiredAmountUsd < prefs.minLoanUsd) continue;
    if (prefs.maxLoanUsd && desiredAmountUsd > prefs.maxLoanUsd) continue;
    if (desiredAmountUsd > maxBorrowUsd) continue;
    if (prefs.unlockWindowDays?.min && daysToUnlock !== null && daysToUnlock < prefs.unlockWindowDays.min) {
      continue;
    }
    if (prefs.unlockWindowDays?.max && daysToUnlock !== null && daysToUnlock > prefs.unlockWindowDays.max) {
      continue;
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
    const interestBps = prefs.interestBps ?? baseRateBps;
    const scoreBase = prefs.riskTier === 'aggressive' ? 85 : prefs.riskTier === 'conservative' ? 70 : 80;
    const ltvScore = ltvBps ? Math.min(15, Math.round((effectiveLtv / ltvBps) * 15)) : 0;
    const score = scoreBase + ltvScore;
    const warnings = [];
    if (prefs.minLiquidityUsd) warnings.push('minLiquidityUsd not verified in MVP');
    if (prefs.minWalletAgeDays) warnings.push('wallet age not verified in MVP');
    if (prefs.minVolumeUsd) warnings.push('volume not verified in MVP');
    if (prefs.allowedTokens?.length) warnings.push('allowedTokens not enforced onchain');
    results.push({
      offerId: `${pool.id}:${chain}:${Date.now()}`,
      poolId: pool.id,
      ownerWallet: pool.ownerWallet,
      chain,
      riskTier: prefs.riskTier,
      interestBps,
      maxBorrowUsd,
      score,
      warnings,
      accessType,
      canAccess,
      lockReason,
      poolName: pool.name
    });
  }
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

app.post('/api/auth/nonce', validateBody(walletNonceSchema), async (req, res) => {
  try {
    if (!ethers.isAddress(req.body.walletAddress)) {
      return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
    }
    const walletAddress = ethers.getAddress(req.body.walletAddress);
    const user = await persistence.getOrCreateUserByWallet(walletAddress);
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000);
    const ipHash = hashIp(getClientIp(req));
    await persistence.clearSessionsByProvider(user.id, 'wallet_nonce');
    await persistence.createSession({
      userId: user.id,
      provider: 'wallet_nonce',
      nonce,
      issuedAt: new Date(),
      expiresAt,
      ipHash
    });
    res.json({
      ok: true,
      walletAddress,
      nonce,
      message: buildWalletMessage(walletAddress, nonce),
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
    const message = buildWalletMessage(walletAddress, req.body.nonce);
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
    const clientIp = getClientIp(req);
    captureUserGeoPresence({ userId: user.id, ip: clientIp });
    res.json({
      ok: true,
      walletAddress,
      sessionToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('[auth] verify error', error?.message || error);
    res.status(500).json({ ok: false, error: 'Unable to verify signature' });
  }
});

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
    const result = await answerAgent(agent, {
      message: req.body?.message,
      history,
      memory
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
          actionTypes: (result.actions || []).map((action) => action.type).slice(0, 8)
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

app.post('/api/pools', requireSession, validateBody(createPoolSchema), async (req, res) => {
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

app.get('/api/pools', async (req, res) => {
  try {
    const pools = await persistence.listPools({
      chain: normalizeText(req.query?.chain, 40),
      ownerWallet: normalizeText(req.query?.ownerWallet, 120),
      status: normalizeText(req.query?.status, 40)
    });
    res.json({ ok: true, pools });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Pool list failed' });
  }
});

app.get('/api/pools/browse', async (req, res) => {
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

app.post('/api/match/quote', validateBody(matchQuoteSchema), async (req, res) => {
  try {
    const { chain, desiredAmountUsd } = req.body;
    const pools = await persistence.listPools({ chain, status: 'active' });
    if (!pools.length) {
      return res.json({ ok: true, offers: [], reason: 'No pools available yet.' });
    }
    let pvUsd = 0;
    let ltvBps = 0;
    let unlockTime = req.body.unlockTime;
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
      }
    }

    const baseRateBps = await getPoolInterestBps();
    const offers = await buildPoolOffers({
      pools,
      desiredAmountUsd,
      pvUsd,
      ltvBps,
      chain,
      unlockTime,
      baseRateBps,
      borrowerWallet: req.body.borrowerWallet || null
    });

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
      note:
        chain === 'solana'
          ? 'Solana offers are advisory only for this MVP; settlement is Base-only.'
          : 'Offers are advisory; final loan terms are enforced onchain.'
    });
  } catch (error) {
    res.status(200).json({ ok: false, error: error?.message || 'Match quote failed' });
  }
});

app.post('/api/match/accept', validateBody(matchAcceptSchema), async (req, res) => {
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
  (req, res) => {
  res.json({ ok: true, action: 'analytics', data: req.body || {} });
  }
);

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
  res.json({
    ok: true,
    items: activityEvents,
    meta: {
      lookbackBlocks: INDEXER_LOOKBACK_BLOCKS,
      lastIndexedBlock,
      latestChainBlock,
      lastPollAt
    }
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
    res.status(200).json({
      ok: false,
      error: error?.message || 'Unable to fetch geo pings',
      items: []
    });
  }
});

app.get('/api/exports/activity', (_req, res) => {
  const rows = [
    ['Event', 'Loan ID', 'Borrower', 'Amount', 'Timestamp', 'TxHash'],
    ...activityEvents.map((event) => [
      event.type,
      event.loanId || '',
      event.borrower || '',
      event.amount || '',
      event.timestamp
        ? new Date(event.timestamp * 1000).toISOString()
        : '',
      event.txHash || ''
    ])
  ];
  const csv = rows.map((row) => row.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="vestra-activity.csv"');
  res.send(csv);
});

app.get('/api/repay-schedule', async (_req, res) => {
  try {
    const contract = new ethers.Contract(
      loanManager.address,
      loanManagerDeployment.abi,
      provider
    );
    const count = await contract.loanCount();
    const total = Number(count);
    const limit = Math.min(total, 10);
    const start = Math.max(total - limit, 0);
    const rows = [];
    for (let i = start; i < total; i += 1) {
      const loan = await contract.loans(i);
      rows.push({
        loanId: i,
        principal: loan[1].toString(),
        interest: loan[2].toString(),
        unlockTime: Number(loan[4]),
        status: loan[5] ? 'Active' : 'Settled'
      });
    }
    cachedRepaySchedule = rows;
    lastScheduleRefresh = Date.now();
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
  const rows = [];

  for (let i = start; i < total; i += 1) {
    const loan = await loanContract.loans(i);
    const collateralId = loan[3];
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

    const createdEvent = activityEvents.find(
      (event) => event.type === 'LoanCreated' && event.loanId === i.toString()
    );
    const unlockTimestamp = Number(unlockTime || loan[4] || 0);
    const daysToUnlock =
      unlockTimestamp > 0
        ? Math.max(0, Math.round((unlockTimestamp * 1000 - Date.now()) / 86400000))
        : null;

    rows.push({
      loanId: i,
      borrower: loan[0],
      principal: loan[1].toString(),
      interest: loan[2].toString(),
      collateralId: collateralId.toString(),
      unlockTime: unlockTimestamp,
      active: Boolean(loan[5]),
      token,
      tokenSymbol,
      tokenDecimals,
      quantity: quantity.toString(),
      pv: pv.toString(),
      ltvBps: ltvBps.toString(),
      daysToUnlock,
      evidence: {
        escrowTx: createdEvent?.txHash
          ? buildExplorerLink('tx', createdEvent.txHash)
          : '',
        wallet: loan[0] ? buildExplorerLink('address', loan[0]) : '',
        token: token ? buildExplorerLink('address', token) : ''
      }
    });
  }

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
  try {
    const items = await getVestedContracts();
    await storeSnapshot(items);
  } catch (error) {
    console.error('[indexer] snapshot error', error?.message || error);
  }
};

app.get('/api/vested-contracts', async (_req, res) => {
  const now = Date.now();
  if (cachedVestedContracts.length && now - cachedVestedContractsAt < VESTED_CACHE_TTL_MS) {
    res.json({
      ok: true,
      items: sanitizeForJson(cachedVestedContracts),
      cached: true,
      cachedAt: cachedVestedContractsAt
    });
    return;
  }
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Vested contracts fetch timed out')),
        VESTED_FETCH_TIMEOUT_MS
      );
    });
    const items = await Promise.race([getVestedContracts(), timeoutPromise]);
    cachedVestedContracts = items;
    cachedVestedContractsAt = Date.now();
    res.json({
      ok: true,
      items: sanitizeForJson(items),
      cached: false,
      cachedAt: cachedVestedContractsAt
    });
  } catch (error) {
    if (cachedVestedContracts.length) {
      res.json({
        ok: true,
        items: sanitizeForJson(cachedVestedContracts),
        cached: true,
        cachedAt: cachedVestedContractsAt,
        error: error?.message || 'error'
      });
      return;
    }
    res.status(200).json({
      ok: false,
      error: error?.message || 'error',
      items: []
    });
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

app.get('/api/solana/repay-config', (_req, res) => {
  res.json({ ok: true, config: getRepayConfig() });
});

app.post('/api/solana/repay-plan', async (req, res) => {
  try {
    const owner = req.body?.owner;
    const maxUsdc = req.body?.maxUsdc;
    if (!owner) {
      res.status(400).json({ ok: false, error: 'owner required' });
      return;
    }
    const plan = await buildRepayPlan({ owner, maxUsdc });
    res.json({ ok: true, plan });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'repay plan error'
    });
  }
});

app.post('/api/solana/repay-sweep', async (req, res) => {
  try {
    const owner = req.body?.owner;
    const maxUsdc = req.body?.maxUsdc;
    if (!owner) {
      res.status(400).json({ ok: false, error: 'owner required' });
      return;
    }
    const result = await executeRepaySweep({ owner, maxUsdc });
    res.json(result);
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'repay sweep error'
    });
  }
});

app.get('/api/exports/repay-schedule', async (_req, res) => {
  try {
    const contract = new ethers.Contract(
      loanManager.address,
      loanManagerDeployment.abi,
      provider
    );
    const count = await contract.loanCount();
    const total = Number(count);
    const limit = Math.min(total, 10);
    const start = Math.max(total - limit, 0);
    const rows = [['Loan ID', 'Principal', 'Interest', 'Unlock', 'Status']];
    for (let i = start; i < total; i += 1) {
      const loan = await contract.loans(i);
      rows.push([
        i,
        loan[1].toString(),
        loan[2].toString(),
        loan[4] ? new Date(Number(loan[4]) * 1000).toISOString() : '',
        loan[5] ? 'Active' : 'Settled'
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
    const rows = [
      ['Loan ID', 'Principal', 'Interest', 'Unlock', 'Status'],
      ...cachedRepaySchedule.map((loan) => [
        loan.loanId,
        loan.principal,
        loan.interest,
        loan.unlockTime
          ? new Date(loan.unlockTime * 1000).toISOString()
          : '',
        loan.status
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

const start = async () => {
  try {
    await initPersistence();
    console.log(
      `[persistence] using ${persistence.useSupabase ? 'Supabase' : 'local SQLite'}`
    );
  } catch (error) {
    console.error('[bootstrap] persistence init failed', error?.message || error);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`Vestra backend running on http://localhost:${port}`);
    if (INDEXER_ENABLED) {
      pollEvents().catch((error) =>
        console.error('[indexer] initial poll error', error?.message || error)
      );
      takeVestedSnapshot().catch((error) =>
        console.error('[indexer] initial snapshot error', error?.message || error)
      );
      setInterval(() => {
        pollEvents().catch((error) =>
          console.error('[indexer] poll error (interval)', error?.message || error)
        );
      }, INDEXER_POLL_INTERVAL_MS);
      setInterval(() => {
        takeVestedSnapshot().catch((error) =>
          console.error('[indexer] snapshot error (interval)', error?.message || error)
        );
      }, INDEXER_SNAPSHOT_INTERVAL_MS);
    } else {
      console.log('[indexer] disabled via INDEXER_ENABLED=false');
    }
  });
};

start().catch((error) => {
  console.error('[startup] fatal', error?.message || error);
  process.exit(1);
});
