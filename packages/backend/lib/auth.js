const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { hashIp } = require('./utils');

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

const getClientIp = (req) => {
  const trustProxy = req.app.get('trust proxy');
  const forwarded = req.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return typeof req.ip === 'string' ? req.ip : '';
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

const rateLimitKeyGenerator = (req) => {
  const token = getSessionToken(req);
  if (token) {
    return `token:${crypto.createHash('sha256').update(token).digest('hex')}`;
  }
  return req.ip;
};

const secureEqual = (left, right) => {
  if (!left || !right) return false;
  const leftBuf = Buffer.from(String(left));
  const rightBuf = Buffer.from(String(right));
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
};

const requireAdmin = (ADMIN_API_KEY, isAdminWallet) => (req, res, next) => {
  const headerKey = String(req.headers['x-admin-key'] || '').trim();
  if (ADMIN_API_KEY && secureEqual(headerKey, ADMIN_API_KEY)) {
    return next();
  }
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') {
    return next();
  }
  if (isAdminWallet(req.user?.walletAddress)) {
    return next();
  }
  return res.status(403).json({ ok: false, error: 'Admin access required' });
};

const attachSession = (persistence) => async (req, _res, next) => {
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

const createLimiters = () => {
  const defaultLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 600),
    keyGenerator: rateLimitKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
  });

  const strictLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_STRICT_MAX || 60),
    keyGenerator: rateLimitKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
  });

  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_CHAT_MAX || 20),
    keyGenerator: rateLimitKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
  });

  const expensiveLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_EXPENSIVE_MAX || 120),
    keyGenerator: rateLimitKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
  });

  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 30),
    keyGenerator: rateLimitKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
  });

  return {
    defaultLimiter,
    strictLimiter,
    chatLimiter,
    expensiveLimiter,
    adminLimiter
  };
};

const requireSession = (persistence) => async (req, res, next) => {
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

const requireWalletOwnerParam = (paramKey, normalizeAnyWalletAddress) => (req, res, next) => {
  const rawTargetWallet = String(req.params?.[paramKey] || '').trim();
  const targetWallet = normalizeAnyWalletAddress(rawTargetWallet);
  if (!targetWallet) {
    return res.status(403).json({ ok: false, error: 'Wallet mismatch' });
  }
  const sessionWallet = normalizeAnyWalletAddress(req.user?.walletAddress || '');
  if (sessionWallet && sessionWallet === targetWallet) {
    return next();
  }
  const linkedWallets = Array.isArray(req.user?.linkedWallets) ? req.user.linkedWallets : [];
  const linkedMatch = linkedWallets.some((wallet) => {
    const candidate = normalizeAnyWalletAddress(wallet?.walletAddress || '');
    return Boolean(candidate && candidate === targetWallet);
  });
  if (!linkedMatch) {
    return res.status(403).json({ ok: false, error: 'Wallet mismatch' });
  }
  return next();
};

module.exports = {
  getSessionToken,
  getClientIp,
  buildSessionFingerprint,
  rateLimitKeyGenerator,
  secureEqual,
  requireAdmin,
  attachSession,
  requireSession,
  requireWalletOwnerParam,
  createLimiters
};
