const crypto = require('crypto');
const { ethers } = require('ethers');
const { PublicKey } = require('@solana/web3.js');

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

const normalizeWalletAddress = (value) => {
  if (!value || typeof value !== 'string') return '';
  try {
    return ethers.getAddress(value.trim()).toLowerCase();
  } catch {
    return '';
  }
};

const normalizeSolanaAddress = (value) => {
  if (!value || typeof value !== 'string') return '';
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    return '';
  }
};

const normalizeAnyWalletAddress = (value) =>
  normalizeWalletAddress(value) || normalizeSolanaAddress(value);

const detectChainTypeForWallet = (value) =>
  normalizeWalletAddress(value) ? 'evm' : normalizeSolanaAddress(value) ? 'solana' : '';

const logoutAllSessions = async (persistence, userId) => {
    // Helper function used in some routes
    return persistence.clearSessionsForUser(userId);
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

const USDC_UNITS = 1_000_000n;
const toUsdFromUsdcUnits = (value) => {
  try {
    const units = typeof value === 'bigint' ? value : BigInt(value || 0);
    const whole = units / USDC_UNITS;
    const frac = units % USDC_UNITS;
    const out = Number(whole) + Number(frac) / 1e6;
    return Number.isFinite(out) ? out : 0;
  } catch {
    const num = Number(value);
    return Number.isFinite(num) ? num / 1e6 : 0;
  }
};

const getDaysToUnlock = (unlockTime) => {
  if (!unlockTime) return null;
  const millis = Number(unlockTime) * 1000 - Date.now();
  return Math.max(0, Math.round(millis / 86400000));
};

const buildWalletMessage = (walletAddress, nonce, issuedAtIso) => {
  const issuedAt = issuedAtIso || new Date().toISOString();
  return [
    'Vestra authentication request',
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
    'Only sign if you trust this request.'
  ].join('\n');
};

const buildSolanaLinkMessage = (userId, walletAddress, nonce, issuedAtIso) => {
  const issuedAt = issuedAtIso || new Date().toISOString();
  return [
    'Vestra Solana wallet link request',
    `User: ${String(userId || '').slice(0, 36)}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
    'Only sign if you trust this request.'
  ].join('\n');
};

const verifySolanaDetachedSignature = (nacl, PublicKey) => ({ walletAddress, message, signatureBase64 }) => {
  if (!walletAddress || !message || !signatureBase64) return false;
  let pubkey = null;
  try {
    pubkey = new PublicKey(walletAddress);
  } catch {
    return false;
  }
  let sig = null;
  try {
    sig = Buffer.from(String(signatureBase64), 'base64');
  } catch {
    return false;
  }
  if (!sig || sig.length !== 64) return false;
  const msgBytes = Buffer.from(String(message), 'utf8');
  return nacl.sign.detached.verify(msgBytes, sig, pubkey.toBytes());
};

module.exports = {
  isPlainObject,
  normalizeText,
  normalizeEmail,
  toNumber,
  toBigIntSafe,
  normalizeWalletAddress,
  normalizeSolanaAddress,
  normalizeAnyWalletAddress,
  detectChainTypeForWallet,
  logoutAllSessions,
  hashIp,
  isPrivateOrLocalIp,
  toUsdFromUsdcUnits,
  getDaysToUnlock,
  buildWalletMessage,
  buildSolanaLinkMessage,
  verifySolanaDetachedSignature
};
