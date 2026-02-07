const { SolanaStreamClient, StreamType, PROGRAM_ID } = require('@streamflow/stream');
const { PublicKey } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');
const { TokenListProvider, ENV } = require('@solana/spl-token-registry');
const { getPriceForMint, getFeedMetadata } = require('./pyth');
const { computeSolanaDpv } = require('./valuation');

const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const DEFAULT_REFRESH_MS = 60_000;
const STREAMFLOW_ENABLED = process.env.SOLANA_STREAMFLOW_ENABLED !== 'false';

const mintCache = new Map();
let tokenListPromise = null;
const unmappedMints = new Map();
let cachedStreams = [];
let lastFetchedAt = 0;
let inFlight = null;

const resolveCluster = () => {
  const raw = (process.env.SOLANA_CLUSTER || 'mainnet').toLowerCase();
  if (raw.startsWith('dev')) return 'devnet';
  if (raw.startsWith('test')) return 'testnet';
  if (raw.startsWith('local')) return 'local';
  return 'mainnet';
};

const loadTokenList = async () => {
  if (tokenListPromise) return tokenListPromise;
  tokenListPromise = new TokenListProvider().resolve().then((tokens) => {
    const cluster = resolveCluster();
    const env =
      cluster === 'devnet'
        ? ENV.Devnet
        : cluster === 'testnet'
          ? ENV.Testnet
          : ENV.MainnetBeta;
    return tokens.filterByChainId(env).getList();
  });
  return tokenListPromise;
};

const resolveSymbolFromRegistry = async (mintAddress) => {
  if (!mintAddress) return '';
  try {
    const list = await loadTokenList();
    const entry = list.find((token) => token.address === mintAddress);
    return entry?.symbol || '';
  } catch {
    return '';
  }
};

const createClient = () => {
  const cluster = resolveCluster();
  const programId = PROGRAM_ID?.[cluster] || PROGRAM_ID?.mainnet;
  const clusterUrl = process.env.SOLANA_RPC_URL || DEFAULT_SOLANA_RPC;
  return new SolanaStreamClient({
    clusterUrl,
    cluster,
    programId
  });
};

const getMintDetails = async (connection, mintAddress) => {
  if (!mintAddress) {
    return { symbol: 'Token', decimals: 0 };
  }
  if (mintCache.has(mintAddress)) {
    return mintCache.get(mintAddress);
  }
  let decimals = 0;
  try {
    const mintInfo = await getMint(connection, new PublicKey(mintAddress));
    decimals = mintInfo?.decimals ?? 0;
  } catch (error) {
    decimals = 0;
  }
  const registrySymbol = await resolveSymbolFromRegistry(mintAddress);
  const metadata = getFeedMetadata(mintAddress);
  const symbol =
    registrySymbol || metadata?.symbol || `Token ${mintAddress.slice(0, 6)}`;
  const resolved = { symbol, decimals };
  mintCache.set(mintAddress, resolved);
  return resolved;
};

const buildSolanaLink = (type, value) => {
  const base = process.env.SOLANA_EXPLORER_BASE_URL || 'https://solscan.io';
  if (!value) return '';
  if (type === 'tx') return `${base}/tx/${value}`;
  if (type === 'token') return `${base}/token/${value}`;
  return `${base}/account/${value}`;
};

const normalizeStreamflow = async (entry, connection) => {
  const account = entry.account;
  const now = Math.floor(Date.now() / 1000);
  const unlockTime = Number(account.end || 0);
  const mint = account.mint?.toString?.() || account.mint || '';
  const quantity = account.depositedAmount?.toString?.() || '0';
  const mintDetails = await getMintDetails(connection, mint);
  const price = await getPriceForMint(mint, mintDetails.symbol);
  if (!price) {
    unmappedMints.set(mint, {
      mint,
      symbol: mintDetails.symbol,
      reason: 'No Pyth feed resolved'
    });
  } else {
    unmappedMints.delete(mint);
  }
  const valuation = price
    ? computeSolanaDpv({
        quantity,
        price: price.price,
        priceExpo: price.expo,
        unlockTime,
        now
      })
    : { pv: '0', ltvBps: '0' };

  const streamId = entry.publicKey?.toString?.() || '';
  const active = !account.closed && unlockTime > now;
  const daysToUnlock =
    unlockTime > 0 ? Math.max(0, Math.round((unlockTime * 1000 - Date.now()) / 86400000)) : null;

  return {
    loanId: streamId,
    borrower: account.recipient?.toString?.() || '',
    principal: '0',
    interest: '0',
    collateralId: streamId,
    unlockTime,
    active,
    token: mint,
    tokenSymbol: mintDetails.symbol,
    tokenDecimals: mintDetails.decimals,
    quantity,
    pv: valuation.pv,
    ltvBps: valuation.ltvBps,
    daysToUnlock,
    chain: 'solana',
    network: resolveCluster(),
    streamId,
    program: PROGRAM_ID?.[resolveCluster()] || PROGRAM_ID?.mainnet,
    evidence: {
      escrowTx: '',
      wallet: account.recipient ? buildSolanaLink('account', account.recipient.toString()) : '',
      token: mint ? buildSolanaLink('token', mint) : ''
    }
  };
};

const fetchStreamflowVestingContracts = async () => {
  if (!STREAMFLOW_ENABLED) {
    cachedStreams = [];
    lastFetchedAt = Date.now();
    return [];
  }
  const refreshMs = Number(process.env.SOLANA_STREAMFLOW_REFRESH_MS || DEFAULT_REFRESH_MS);
  if (Date.now() - lastFetchedAt < refreshMs && cachedStreams.length) {
    return cachedStreams;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const client = createClient();
    const includeClosed = process.env.SOLANA_STREAMFLOW_INCLUDE_CLOSED === 'true';
    let streams = [];
    try {
      streams = await client.searchStreams(includeClosed ? {} : { closed: false });
    } catch (error) {
      if (includeClosed) {
        try {
          streams = await client.searchStreams({ closed: false });
        } catch (fallbackError) {
          console.warn('[solana] streamflow search failed', fallbackError?.message || fallbackError);
          cachedStreams = [];
          lastFetchedAt = Date.now();
          return [];
        }
      } else {
        console.warn('[solana] streamflow search failed', error?.message || error);
        cachedStreams = [];
        lastFetchedAt = Date.now();
        return [];
      }
    }
    const vesting = streams.filter((entry) => entry.account?.type === StreamType.Vesting);
    const limit = Number(process.env.SOLANA_STREAMFLOW_LIMIT || 0);
    const limited = limit > 0 ? vesting.slice(0, limit) : vesting;
    const connection = client.getConnection();
    const normalized = [];
    for (const entry of limited) {
      try {
        normalized.push(await normalizeStreamflow(entry, connection));
      } catch (error) {
        console.warn('[solana] failed to normalize stream', error?.message || error);
      }
    }
    cachedStreams = normalized;
    lastFetchedAt = Date.now();
    return normalized;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
};

module.exports = {
  fetchStreamflowVestingContracts,
  getUnmappedMints: () => Array.from(unmappedMints.values())
};
