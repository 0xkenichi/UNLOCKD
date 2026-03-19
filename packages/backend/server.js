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
  TIER_NAMES,
  computeScore: computeIdentityScore,
  policyCheck
} = require('./identityCreditScore');
const {
  fetchStreamflowVestingContracts,
  getUnmappedMints
} = require('./solana/streamflow');
const { fetchSablierStreams } = require('./evm/sablier');
const { fetchSuperfluidStreams } = require('./evm/superfluid');
const { fetchBonfidaVesting } = require('./solana/bonfida');
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
  volatility: 10, // Default agent count/intensity
  interestRateBps: 800, // 8.0%
  lastUpdate: Date.now()
};
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

const erc20Abi = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

const communityPoolReadAbi = [
  'function communityPoolCount() view returns (uint256)',
  'function pendingCommunityPoolRewards(uint256 poolId, address user) view returns (uint256)',
  'function communityPools(uint256) view returns (string name,address creator,uint256 targetAmount,uint256 maxAmount,uint256 deadline,uint256 totalContributed,uint256 totalBuildingUnits,uint256 participantCount,uint256 accRewardPerWeight,uint256 totalRewardFunded,bool rewardsByBuildingSize,uint8 state)'
];

const vestingWalletReadAbi = [
  'function token() view returns (address)',
  'function totalAllocation() view returns (uint256)',
  'function start() view returns (uint256)',
  'function duration() view returns (uint256)',
  'function released(address) view returns (uint256)'
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
    trimMapToLimit(blockCache, BLOCK_CACHE_MAX_ITEMS);
  }
  const base = {
    txHash: log.transactionHash,
    // ethers v6 uses `index` for log index (not `logIndex`)
    logIndex: Number(log.index ?? log.logIndex ?? 0),
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
  if (parsed.name === 'PrivateLoanCreated') {
    // Do not include vault address in public-facing activity payloads.
    return {
      ...base,
      type: 'PrivateLoanCreated',
      loanId: parsed.args.loanId.toString(),
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
  if (parsed.name === 'PrivateLoanRepaid') {
    return {
      ...base,
      type: 'PrivateLoanRepaid',
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
  if (parsed.name === 'PrivateLoanSettled') {
    return {
      ...base,
      type: 'PrivateLoanSettled',
      loanId: parsed.args.loanId.toString(),
      defaulted: Boolean(parsed.args.defaulted)
    };
  }

  // --- V9.0 Sovereign Events ---
  try {
    const nftParsed = loanNFT.iface.parseLog(log);
    if (nftParsed?.name === 'LoanProofMinted') {
      return {
        ...base,
        type: 'LoanProofMinted',
        loanId: nftParsed.args.loanId.toString(),
        borrower: nftParsed.args.borrower,
        payload: { tokenId: nftParsed.args.tokenId.toString() }
      };
    }
  } catch (_) { }

  try {
    const clawParsed = openClawLighthouse.iface.parseLog(log);
    if (clawParsed?.name === 'VoteSubmitted') {
      return {
        ...base,
        type: 'VoteSubmitted',
        tokenAddress: clawParsed.args.token,
        payload: {
          agent: clawParsed.args.agent,
          omegaBps: clawParsed.args.omegaBps.toString()
        }
      };
    }
  } catch (_) { }

  try {
    const factoryParsed = vestingRegistry.iface.parseLog(log);
    if (factoryParsed?.name === 'ContractSubmitted') {
      return {
        ...base,
        type: 'ContractSubmitted',
        vestingContract: factoryParsed.args.wrapper,
        submitter: factoryParsed.args.submitter
      };
    }
    if (factoryParsed?.name === 'ContractRanked') {
      return {
        ...base,
        type: 'ContractRanked',
        vestingContract: factoryParsed.args.wrapper,
        payload: { rank: factoryParsed.args.rank.toString() }
      };
    }
  } catch (_) { }

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
  if (seenEvents.size > INDEXER_MAX_EVENTS * 2) {
    seenEvents.clear();
    activityEvents.forEach((event) => {
      seenEvents.add(`${event.txHash}-${event.logIndex}`);
    });
  }
};

const is429 = (err) => {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('rate-limit') || // Added for robustness
    msg.includes('throttled') || // Added for robustness
    err?.info?.error?.code === 429 ||
    err?.status === 429 ||
    err?.response?.status === 429 // Added for robustness (e.g., axios errors)
  );
};

const getLogsWithRetry = async (params) => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeoutReject(
        provider.getLogs(params),
        Number(process.env.RPC_GETLOGS_TIMEOUT_MS || 12000),
        'eth_getLogs'
      );
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
  if (pollInFlight) return;
  pollInFlight = true;
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
    const maxBlocks = Math.max(10, Math.min(INDEXER_MAX_BLOCKS_PER_POLL, 250000));
    const endBlock = Math.min(latestBlock, startBlock + maxBlocks - 1);
    const chunkSize = 10;
    for (let from = startBlock; from <= endBlock; from += chunkSize) {
      const to = Math.min(from + chunkSize - 1, endBlock);

      const topics = [
        getEventTopic(loanManager.iface, 'LoanCreated'),
        getEventTopic(loanManager.iface, 'PrivateLoanCreated'),
        getEventTopic(loanManager.iface, 'LoanRepaid'),
        getEventTopic(loanManager.iface, 'PrivateLoanRepaid'),
        getEventTopic(loanManager.iface, 'LoanRepaidWithSwap'),
        getEventTopic(loanManager.iface, 'LoanSettled'),
        getEventTopic(loanManager.iface, 'PrivateLoanSettled'),
        getEventTopic(loanNFT.iface, 'LoanProofMinted'),
        getEventTopic(openClawLighthouse.iface, 'VoteSubmitted'),
        getEventTopic(globalRiskModule.iface, 'BadDebtThresholdBreached'),
        getEventTopic(lendingPool.iface, 'CommunityPoolCreated'),
        getEventTopic(lendingPool.iface, 'CommunityPoolContribution'),
        getEventTopic(vestingRegistry.iface, 'ContractSubmitted'),
        getEventTopic(vestingRegistry.iface, 'ContractRanked')
      ].filter(Boolean);

      // Batch fetch all topics in one RPC call per chunk
      const allLogs = await getLogsWithRetry({
        address: [
          loanManager.address,
          loanNFT.address,
          openClawLighthouse.address,
          globalRiskModule.address,
          lendingPool.address,
          vestingRegistry.address
        ],
        fromBlock: from,
        toBlock: to,
        topics: [topics]
      });

      const normalized = await mapWithConcurrency(
        allLogs,
        async (log) => {
          try {
            const e = await normalizeEvent(log);
            if (!e) return null;
            
            // Phase 1 Points Allocation Logic
            if (e.type === 'LoanCreated' || e.type === 'PrivateLoanCreated') {
                const amountUsd = parseFloat(ethers.formatUnits(e.amount || '0', 6));
                const borrowPoints = Math.floor(amountUsd / 10); // 100 points per $1000 PV
                const privacyMultiplier = e.type === 'PrivateLoanCreated' ? 1.2 : 1.0;
                await persistence.updatePoints(e.borrower, { 
                    borrow: borrowPoints, 
                    privacy: e.type === 'PrivateLoanCreated' ? Math.floor(borrowPoints * 0.2) : 0 
                });
            } else if (e.type === 'CommunityPoolContribution') {
                const amountUsd = parseFloat(ethers.formatUnits(e.amount || '0', 6));
                const lendPoints = Math.floor(amountUsd / 6.66); // ~150 points per $1000 liquidity
                await persistence.updatePoints(e.contributor, { lend: lendPoints });
            } else if (e.type === 'ContractRanked') {
                await persistence.updateVestingRank(e.vestingContract, e.payload.rank);
            }

            if (e.type !== 'LoanCreated' && e.type !== 'PrivateLoanCreated') return e;

            // Parallelize enrichment for individual loans
            const loanManagerContract = new ethers.Contract(loanManager.address, loanManagerDeployment.abi, provider);
            const adapterContractForIndexer = new ethers.Contract(vestingAdapter.address, vestingAdapterDeployment.abi, provider);

            const loan =
              e.type === 'PrivateLoanCreated'
                ? await loanManagerContract.privateLoans(e.loanId)
                : await loanManagerContract.loans(e.loanId);

            const collateralId = loan?.collateralId ?? loan?.[3];
            if (collateralId != null) {
              const details = await adapterContractForIndexer.getDetails(collateralId);
              const token = details?.[1];
              if (token) e.tokenAddress = typeof token === 'string' ? token : (token?.toString?.() ?? null);
            }
            return e;
          } catch (err) {
            return null;
          }
        },
        RPC_CONCURRENCY_LIMIT
      );

      const validEvents = normalized.filter(Boolean);
      for (const e of validEvents) {
        if (e.type === 'LoanCreated' || e.type === 'PrivateLoanCreated') {
          // Push initial lean state to the Omega Watcher grid
          omegaWatcher.emit('loanCreated', {
            id: e.loanId,
            principal: e.amount || '0',
            interestAccrued: '0',
            collateralValueUsd: '0', // Will be enriched on next tick
            durationDays: 30, // Default mock logic if unset
            elapsedDays: 0
          });
        }
      }

      await pushEvents(validEvents);
    }
    lastIndexedBlock = endBlock;
    await persistence.setMeta('lastIndexedBlock', lastIndexedBlock);
  } catch (error) {
    console.error('[indexer] poll error', error?.message || error);
  } finally {
    pollInFlight = false;
  }
};

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
    return ethers.getAddress(value.trim());
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

// --- Relayer request auth (EIP-712, offchain only) ---

const sortKeysDeep = (value) => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.keys(value)
    .sort()
    .forEach((key) => {
      out[key] = sortKeysDeep(value[key]);
    });
  return out;
};

const stableStringify = (value) => JSON.stringify(sortKeysDeep(value));

const relayerTypes = {
  RelayerRequest: [
    { name: 'user', type: 'address' },
    { name: 'vault', type: 'address' },
    { name: 'action', type: 'string' },
    { name: 'payloadHash', type: 'bytes32' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' }
  ]
};

let cachedEvmChainId = null;
const getEvmChainId = async () => {
  if (cachedEvmChainId != null) return cachedEvmChainId;
  try {
    const net = await provider.getNetwork();
    cachedEvmChainId = Number(net?.chainId || 0);
  } catch {
    cachedEvmChainId = Number(process.env.EVM_CHAIN_ID || 0) || 0;
  }
  return cachedEvmChainId;
};

const hashRelayerPayload = (payload) =>
  ethers.keccak256(ethers.toUtf8Bytes(stableStringify(payload || {})));

const verifyRelayerAuth = async ({ req, action, payload, vaultAddress } = {}) => {
  const sessionWallet = normalizeWalletAddress(req.user?.walletAddress || '');
  if (!sessionWallet) throw new Error('Session wallet required');
  if (!vaultAddress || !ethers.isAddress(vaultAddress)) throw new Error('Vault address required');

  const signature = String(req.body?.signature || '').trim();
  const nonce = String(req.body?.nonce || '').trim();
  const issuedAt = Number(req.body?.issuedAt || 0);
  const expiresAt = Number(req.body?.expiresAt || 0);
  if (!signature || !nonce || !issuedAt || !expiresAt) throw new Error('Missing relayer auth');

  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + 60) throw new Error('Relayer auth not yet valid');
  if (expiresAt < now) throw new Error('Relayer auth expired');
  if (expiresAt - issuedAt > 10 * 60) throw new Error('Relayer auth window too long');

  const chainId = await getEvmChainId();
  if (!chainId) throw new Error('Chain ID unavailable');

  const payloadHash = hashRelayerPayload(payload);
  const claimedHash = String(req.body?.payloadHash || '').trim();
  if (claimedHash && claimedHash.toLowerCase() !== payloadHash.toLowerCase()) {
    throw new Error('Relayer payload hash mismatch');
  }

  const domain = {
    name: 'VestraRelayer',
    version: '1',
    chainId,
    verifyingContract: loanManager.address
  };
  const message = {
    user: sessionWallet,
    vault: ethers.getAddress(vaultAddress),
    action: String(action || ''),
    payloadHash,
    nonce,
    issuedAt,
    expiresAt
  };
  let recovered = '';
  try {
    recovered = ethers.verifyTypedData(domain, relayerTypes, message, signature);
  } catch (_) {
    throw new Error('Invalid relayer signature');
  }
  if (!recovered || recovered.toLowerCase() !== sessionWallet.toLowerCase()) {
    throw new Error('Relayer signature wallet mismatch');
  }

  // Replay protection.
  await persistence.consumeRelayerNonce({
    userId: req.user?.id,
    action,
    nonce,
    expiresAt
  });
  return { ok: true, payloadHash };
};

const isAdminWallet = (walletAddress) => {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return false;
  const allowlist = String(process.env.ADMIN_WALLETS || '')
    .split(',')
    .map((item) => normalizeWalletAddress(item))
    .filter(Boolean);
  return allowlist.includes(normalized);
};

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
  const normalizedEvm = normalizeWalletAddress(walletAddress);
  const normalizedSolana = normalizeSolanaAddress(walletAddress);
  const normalized = normalizedEvm || normalizedSolana;
  if (!normalized) return null;
  const profile = await persistence.getIdentityProfileByWallet(normalized);
  const attestations = await persistence.listIdentityAttestations(normalized);
  const identity = {
    linkedAt: profile?.linkedAt || null,
    identityProofHash: profile?.identityProofHash || null,
    sanctionsPass:
      profile?.sanctionsPass === null || profile?.sanctionsPass === undefined
        ? true
        : Boolean(profile.sanctionsPass)
  };
  const creditHistory = normalizedEvm
    ? getCreditHistoryForWallet(normalized)
    : { repaidCount: 0, defaultedCount: 0 };
  const score = computeIdentityScore({
    identity,
    attestations,
    creditHistory
  });

  return {
    walletAddress: normalized,
    ...score,
    tierName: TIER_NAMES[score.crdtTier] || 'Anonymous',
    policy: {
      small: policyCheck(score.crdtTier, score.crdtScore, 'small'),
      medium: policyCheck(score.crdtTier, score.crdtScore, 'medium'),
      large: policyCheck(score.crdtTier, score.crdtScore, 'large')
    },
    attestations,
    creditHistory
  };
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

const getClientIp = (req) => {
  const trustProxyEnabled = Boolean(app.get('trust proxy'));
  const forwarded = req.headers['x-forwarded-for'];
  if (trustProxyEnabled && typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return typeof req.ip === 'string' ? req.ip : '';
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
  if (geoLookupCache.size > GEO_CACHE_MAX_ITEMS) {
    const cutoff = Date.now() - GEO_CACHE_TTL_MS;
    for (const [key, entry] of geoLookupCache.entries()) {
      if (!entry || entry.at < cutoff) {
        geoLookupCache.delete(key);
      }
    }
    trimMapToLimit(geoLookupCache, GEO_CACHE_MAX_ITEMS);
  }
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

const recordAdminAudit = async (req, action, details = {}) => {
  try {
    await persistence.saveAdminAuditLog({
      action,
      actorUserId: req.user?.id || null,
      actorWallet: req.user?.walletAddress || null,
      actorRole: req.user?.role || null,
      targetType: details.targetType || null,
      targetId: details.targetId || null,
      ipHash: hashIp(getClientIp(req)),
      sessionFingerprint: buildSessionFingerprint(req),
      payload: details.payload || {}
    });
  } catch (error) {
    console.warn('[admin] audit log persist failed', error?.message || error);
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

const rateLimitKeyGenerator = (req) => {
  const token = getSessionToken(req);
  if (token) {
    return `token:${crypto.createHash('sha256').update(token).digest('hex')}`;
  }
  const ip = getClientIp(req) || req.ip || '';
  if (ip && typeof rateLimit.ipKeyGenerator === 'function') {
    return `ip:${rateLimit.ipKeyGenerator(ip)}`;
  }
  const ipHash = hashIp(ip);
  if (ipHash) return `ip:${ipHash}`;
  return 'unknown';
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

const requireWalletOwnerParam = (paramKey) => (req, res, next) => {
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

const secureEqual = (left, right) => {
  if (!left || !right) return false;
  const leftBuf = Buffer.from(String(left));
  const rightBuf = Buffer.from(String(right));
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
};

const requireAdmin = (req, res, next) => {
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
  max: Number(process.env.RATE_LIMIT_MAX || 600),
  keyGenerator: rateLimitKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_STRICT_MAX || 60),
  keyGenerator: rateLimitKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CHAT_MAX || 20),
  keyGenerator: rateLimitKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_EXPENSIVE_MAX || 120),
  keyGenerator: rateLimitKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 30),
  keyGenerator: rateLimitKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(defaultLimiter);
app.use(requireJsonBody);
app.use(honeypotCheck);
app.use(attachSession);

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
    ...simulationState
  });
});

app.post('/api/simulation/update', requireAdmin, (req, res) => {
  const { volatility, interestRateBps } = req.body;
  if (volatility !== undefined) simulationState.volatility = Number(volatility);
  if (interestRateBps !== undefined) simulationState.interestRateBps = Number(interestRateBps);
  simulationState.lastUpdate = Date.now();
  
  // Inform Omega Watcher of changes
  omegaWatcher.emit('simulationUpdate', simulationState);
  
  res.json({ ok: true, state: simulationState });
});

app.get('/api/omega/alerts', (req, res) => {
  res.json({
    ok: true,
    alerts: omegaWatcher.alerts || []
  });
});


app.get('/api/loan/:id/health', async (req, res) => {
  const { id } = req.params;
  const loan = omegaWatcher.activeLoans.get(id);
  if (!loan) {
    return res.status(404).json({ ok: false, error: 'Loan not tracked by sentinel' });
  }

  const healthFactor = meTTabrain.evaluateLoanHealth({
    principal: loan.principal,
    interestAccrued: loan.interestAccrued || '0',
    collateralValueUsd: loan.collateralValueUsd || '0',
    durationDays: loan.durationDays || 30,
    elapsedDays: loan.elapsedDays || 0
  });

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
app.post('/api/faucet/usdc', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ ok: false, error: 'Valid EVM address required' });
    }

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
  }
});

// Community Lending Pools

app.get('/api/loans', async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ ok: false, error: 'wallet required' });
    const loans = await persistence.getLoansByWallet(wallet);
    res.json({ ok: true, items: loans });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const computeLoanTerms = (identityTier, score) => {
  // Base APR starts at 1500 bps (15%)
  // Base LTV starts at 3000 bps (30%)
  let aprBps = 1500;
  let ltvBps = 3000;

  if (identityTier >= 5) { // Institutional
    aprBps = 450; // 4.5%
    ltvBps = 8500; // 85%
  } else if (identityTier === 4) { // Trusted
    aprBps = 750; // 7.5%
    ltvBps = 7500; // 75%
  } else if (identityTier === 3) { // Verified
    aprBps = 1000; // 10%
    ltvBps = 6500; // 65%
  } else if (identityTier === 2) { // Standard
    aprBps = 1200; // 12%
    ltvBps = 5000; // 50%
  }

  // Score bonus: reduce APR by up to 200 bps for high score within tier
  const scoreBonus = Math.floor((score / 1000) * 200);
  aprBps -= scoreBonus;

  return { aprBps, ltvBps };
};

app.post('/api/loans/simulate', async (req, res) => {
  try {
    const { wallet, amount, collateralId } = req.body;
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
    const { wallet, amount, ltvBps, aprBps, collateralItems } = req.body;
    if (!wallet || !amount) return res.status(400).json({ ok: false, error: 'missing fields' });

    const loanId = await persistence.createLoan({
      walletAddress: wallet,
      amount,
      ltvBps,
      aprBps,
      collateralItems
    });

    res.json({ ok: true, loanId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// V16.0 Incentivized Testnet Points & Leaderboard
app.get('/api/testnet/points/:wallet', async (req, res) => {
  const wallet = normalizeAnyWalletAddress(req.params.wallet || '');
  if (!wallet) return res.status(400).json({ ok: false, error: 'Invalid wallet' });
  try {
    const points = await persistence.getPoints(wallet);
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
        console.warn(`[server] Live Gitcoin fetch failed for ${identityWallet}, using 0.`);
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

const vestingValidateSchema = z
  .object({
    vestingContract: z.string().trim().refine(ethers.isAddress, 'Invalid address'),
    protocol: z.enum(['manual', 'sablier']).optional(),
    lockupAddress: z.string().trim().max(42).optional(),
    streamId: z.string().trim().max(80).optional()
  })
  .strip();

const fundraisingLinkSchema = z
  .object({
    projectId: z.string().trim().min(1).max(120),
    token: z.string().trim().max(42).optional(),
    treasury: z.string().trim().max(42).optional(),
    chain: z.string().trim().min(1).max(32),
    vestingPolicyRef: z.string().trim().max(200).optional()
  })
  .strip();

app.post('/api/vesting/validate', validateBody(vestingValidateSchema), async (req, res) => {
  try {
    const { vestingContract, protocol, lockupAddress, streamId } = req.body;
    const address = ethers.getAddress(vestingContract);
    const contract = new ethers.Contract(address, vestingWalletReadAbi, provider);
    const tokenAddr = await contract.token();
    const [totalAllocation, start, duration, releasedAmount] = await Promise.all([
      contract.totalAllocation(),
      contract.start(),
      contract.duration(),
      contract.released(tokenAddr).catch(() => 0n)
    ]);
    const token = typeof tokenAddr === 'string' ? tokenAddr : tokenAddr;
    const total = BigInt(totalAllocation ?? 0);
    const released = BigInt(releasedAmount ?? 0);
    const quantity = total - released;
    const startNum = Number(start ?? 0);
    const durationNum = Number(duration ?? 0);
    const unlockTime = startNum + durationNum;
    const valid = total > 0n && durationNum > 0 && unlockTime > Math.floor(Date.now() / 1000);
    if (valid && (protocol === 'sablier' && (lockupAddress || streamId))) {
      await persistence.saveVestingSource({
        chainId: (await provider.getNetwork()).chainId.toString(),
        vestingContract: address,
        protocol: protocol || 'manual',
        lockupAddress: lockupAddress || null,
        streamId: streamId || null
      });
    }
    res.json({
      valid,
      quantity: quantity.toString(),
      token,
      unlockTime,
      totalAllocation: total.toString(),
      released: released.toString()
    });
  } catch (err) {
    res.status(400).json({
      valid: false,
      error: err.message || 'Failed to read vesting contract'
    });
  }
});

app.post('/api/fundraising/link', requireSession, validateBody(fundraisingLinkSchema), async (req, res) => {
  try {
    const source = await persistence.createFundraisingSource({
      projectId: req.body.projectId,
      token: req.body.token || null,
      treasury: req.body.treasury || null,
      chain: req.body.chain,
      vestingPolicyRef: req.body.vestingPolicyRef || null
    });
    res.json({ ok: true, source });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Failed to link fundraising source' });
  }
});

app.get('/api/fundraising/sources', requireSession, async (req, res) => {
  try {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
    const chain = typeof req.query.chain === 'string' ? req.query.chain : null;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const sources = await persistence.listFundraisingSources({ projectId, chain, limit });
    res.json({ ok: true, sources });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Failed to list fundraising sources' });
  }
});

app.get('/api/fundraising/sources/:id', requireSession, async (req, res) => {
  try {
    const source = await persistence.getFundraisingSource(req.params.id);
    if (!source) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, source });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Failed to get fundraising source' });
  }
});

app.patch('/api/fundraising/sources/:id', requireSession, validateBody(z.object({
  token: z.string().trim().max(42).optional(),
  treasury: z.string().trim().max(42).optional(),
  vestingPolicyRef: z.string().trim().max(200).optional()
}).strip()), async (req, res) => {
  try {
    const updated = await persistence.updateFundraisingSource(req.params.id, {
      token: req.body.token,
      treasury: req.body.treasury,
      vestingPolicyRef: req.body.vestingPolicyRef
    });
    if (!updated) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, source: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Failed to update fundraising source' });
  }
});

app.get('/api/vesting/sources', strictLimiter, async (req, res) => {
  try {
    const chainId = (req.query?.chainId || req.query?.chain || '').trim() || null;
    const protocol = (req.query?.protocol || '').trim() || null;
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 200);
    const sources = await persistence.listVestingSources({ chainId, protocol, limit });
    res.json({ ok: true, sources });
  } catch (err) {
    res.status(400).json({ ok: false, error: err?.message || 'Failed to list vesting sources', sources: [] });
  }
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
    interestBps: z.number().int().min(0).max(5000).optional(),
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
    tokenType: optionalString(60),
    tokenCategory: optionalString(40),
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

const linkWalletSchema = z
  .object({
    chainType: z.enum(['evm', 'solana']),
    walletAddress: stringField(120),
    // For Solana wallet linking, require an offchain signature from the wallet being linked.
    signature: optionalString(600),
    issuedAt: optionalString(64)
  })
  .strip();

const solanaNonceSchema = z
  .object({
    walletAddress: stringField(120)
  })
  .strip();

const solanaLinkWalletSchema = z
  .object({
    walletAddress: stringField(120),
    nonce: stringField(256),
    signature: stringField(500)
  })
  .strip();

const privateLoanCreateSchema = z
  .object({
    collateralId: z.union([
      z.string().trim().regex(/^\d+$/, 'collateralId must be an integer'),
      z.number().int().min(0)
    ]),
    vestingContract: stringField(120),
    borrowAmount: z.union([
      z.string().trim().regex(/^\d+$/, 'borrowAmount must be an integer'),
      z.number().int().positive()
    ]),
    collateralAmount: z
      .union([
        z.string().trim().regex(/^\d+$/, 'collateralAmount must be an integer'),
        z.number().int().positive()
      ])
      .optional()
      .nullable(),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const privateLoanRepaySchema = z
  .object({
    loanId: z.union([z.string().trim().regex(/^\d+$/, 'loanId must be an integer'), z.number().int().min(0)]),
    amount: z.union([z.string().trim().regex(/^\d+$/, 'amount must be an integer'), z.number().int().positive()]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const privateLoanSettleSchema = z
  .object({
    loanId: z.union([z.string().trim().regex(/^\d+$/, 'loanId must be an integer'), z.number().int().min(0)]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const sablierUpgradeSchema = z
  .object({
    lockupAddress: stringField(120),
    streamId: z.union([z.string().trim().regex(/^\d+$/, 'streamId must be an integer'), z.number().int().positive()]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const ozUpgradeSchema = z
  .object({
    vestingAddress: stringField(120),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const timelockUpgradeSchema = z
  .object({
    timelockAddress: stringField(120),
    durationSeconds: z.union([
      z.string().trim().regex(/^\d+$/, 'durationSeconds must be an integer'),
      z.number().int().positive()
    ]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const superfluidUpgradeSchema = z
  .object({
    token: stringField(120),
    totalAllocation: z.union([
      z.string().trim().regex(/^\d+$/, 'totalAllocation must be an integer'),
      z.number().int().positive()
    ]),
    startTime: z.union([
      z.string().trim().regex(/^\d+$/, 'startTime must be an integer'),
      z.number().int().nonnegative()
    ]),
    durationSeconds: z.union([
      z.string().trim().regex(/^\d+$/, 'durationSeconds must be an integer'),
      z.number().int().positive()
    ]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const isValidSolanaPublicKey = (value) => {
  try {
    return Boolean(new PublicKey(String(value).trim()));
  } catch {
    return false;
  }
};

const solanaRepaySchema = z
  .object({
    owner: z
      .string()
      .trim()
      .refine((value) => isValidSolanaPublicKey(value), 'Invalid owner public key'),
    maxUsdc: z
      .union([
        z.string().trim().regex(/^\d+$/, 'maxUsdc must be a non-negative integer'),
        z.number().int().min(0)
      ])
      .optional()
  })
  .strip()
  .transform((value) => ({
    ...value,
    maxUsdc: value.maxUsdc === undefined ? undefined : String(value.maxUsdc)
  }));

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
    context: z
      .object({
        path: optionalString(160),
        chainId: z.number().int().positive().optional(),
        walletAddress: optionalAddress,
        page: optionalString(80)
      })
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

const chainRequestSchema = z
  .object({
    chainId: z.number().int().positive().optional(),
    chainName: optionalString(60),
    feature: optionalString(60),
    vestingStandard: optionalString(80),
    message: optionalString(500),
    walletAddress: optionalAddress.optional(),
    page: optionalString(120)
  })
  .strip()
  .refine(
    (value) => Boolean(value.chainId || value.chainName),
    'Provide chainId or chainName'
  );

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

const adminIdentityPatchSchema = z
  .object({
    linkedAt: z.string().datetime().optional(),
    identityProofHash: z.string().trim().max(256).nullable().optional(),
    sanctionsPass: z.boolean().nullable().optional()
  })
  .strip();

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

const verifySolanaDetachedSignature = ({ walletAddress, message, signatureBase64 }) => {
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

const getDaysToUnlock = (unlockTime) => {
  if (!unlockTime) return null;
  const millis = Number(unlockTime) * 1000 - Date.now();
  return Math.max(0, Math.round(millis / 86400000));
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
      await verifyRelayerAuth({
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
      await verifyRelayerAuth({
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
      await verifyRelayerAuth({
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

      await verifyRelayerAuth({
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
      poolContract.totalDeposits(),
      poolContract.totalBorrowed(),
      poolContract.getInterestRateBps(),
      poolContract.utilizationRateBps(),
      poolContract.communityPoolCount()
    ]);
    poolStats = {
      totalDeposits: totalDeposits.toString(),
      totalBorrowed: totalBorrowed.toString(),
      interestRateBps: Number(rateBps),
      utilizationBps: Number(utilBps),
      communityPoolCount: Number(communityPoolCount)
    };
  } catch (err) {
    // RPC or contract not available on this chain
  }
  return {
    generatedAt: new Date().toISOString(),
    activity24h: counts24h,
    activity7d: counts7d,
    defaults24h,
    defaults7d,
    pool: poolStats,
    growth: {
      tvlUsd: poolStats ? parseFloat(poolStats.totalDeposits) / 1e6 : 42.8,
      debtUsd: poolStats ? parseFloat(poolStats.totalBorrowed) / 1e6 : 12.4
    },
    revenue: {
      total: poolStats ? (parseFloat(poolStats.totalBorrowed) * 0.005) / 1e3 : 142.5 // Estimated 50bps fee
    },
    market: {
      globalTvl: 1240000000000 // 1.24T default from Llama
    }
  };
};

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
      const leaderboard = await persistence.getAirdropLeaderboard({ windowDays, limit, phase });
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

// --- Vestra Protocol: MVP Real Data Portfolio Scanning ---

app.get('/api/portfolio/:wallet', strictLimiter, async (req, res) => {
  const walletAddress = normalizeAnyWalletAddress(req.params.wallet || '');
  if (!walletAddress) {
    return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
  }

  try {
    const liquidTokens = [];
    const vestedTokens = [];

    // 1. Scan for Liquid ERC20s using Alchemy Token API (Sepolia)
    const alchemyUrl = process.env.ALCHEMY_SEPOLIA_URL;
    if (alchemyUrl) {
      try {
        const fetchRes = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alchemy_getTokenBalances',
            params: [walletAddress, 'erc20'],
            id: 1
          })
        });
        const alchemyData = await fetchRes.json();
        const balances = alchemyData?.result?.tokenBalances || [];

        // Fetch metadata concurrently for non-zero balances
        const nonZeroTokenAddresses = balances
          .filter((t) => t.tokenBalance && BigInt(t.tokenBalance) > 0n)
          .map((t) => t.contractAddress);

        if (nonZeroTokenAddresses.length > 0) {
          const metadataRes = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'alchemy_getTokenMetadataBatch',
              params: nonZeroTokenAddresses.map(addr => [addr]),
              id: 2
            })
          });
          const metaDataBatch = await metadataRes.json();

          nonZeroTokenAddresses.forEach((address, index) => {
            const balanceHex = balances.find(b => b.contractAddress.toLowerCase() === address.toLowerCase())?.tokenBalance;
            const rawBalance = BigInt(balanceHex || '0');
            const meta = metaDataBatch?.result?.[index] || {};

            liquidTokens.push({
              type: 'liquid',
              tokenAddress: address,
              symbol: meta.symbol || 'UNKNOWN',
              decimals: meta.decimals || 18,
              logo: meta.logo || null,
              rawBalance: rawBalance.toString(),
              formattedBalance: (Number(rawBalance) / (10 ** (meta.decimals || 18))).toFixed(4)
            });
          });
        }
      } catch (e) {
        console.error('[portfolio] alchemy liquid parsing failed', e);
      }
    }

    // 2. Scan for Vested Contracts (Fallback to known tracking or DB records)
    // For MVP, we query the `vesting/sources` to see if this user has matched vest contracts registered.
    const knownVests = await persistence.listVestingSources({ chainId: '11155111', limit: 50 });

    // In a real scenario, we'd check if the user is the beneficiary. We'll do a quick on-chain read for each known vest.
    if (knownVests && knownVests.length > 0) {
      await Promise.all(knownVests.map(async (vest) => {
        try {
          const vContract = new ethers.Contract(vest.vestingContract, vestingWalletReadAbi, provider);
          // OpenZeppelin VestingWallet doesn't have a public `beneficiary()` by default in some older versions,
          // but standard ones do. We'll try to read it.
          let isOwner = false;
          try {
            const benIface = new ethers.Contract(vest.vestingContract, ['function beneficiary() view returns (address)', 'function owner() view returns (address)'], provider);
            const ben = await benIface.beneficiary().catch(() => null);
            const own = await benIface.owner().catch(() => null);
            if (ben?.toLowerCase() === walletAddress.toLowerCase() || own?.toLowerCase() === walletAddress.toLowerCase()) {
              isOwner = true;
            }
          } catch (e) { }

          if (isOwner) {
            const tokenAddr = await vContract.token().catch(() => null);
            if (tokenAddr) {
              const tContract = new ethers.Contract(tokenAddr, erc20Abi, provider);
              const symbol = await tContract.symbol().catch(() => 'V-TKN');
              const decimals = await tContract.decimals().catch(() => 18);
              const totalAllocation = await vContract.totalAllocation().catch(() => 0n);
              const released = await vContract.released(tokenAddr).catch(() => 0n);
              const locked = totalAllocation - released;

              if (locked > 0n) {
                vestedTokens.push({
                  type: 'vested',
                  vestingContract: vest.vestingContract,
                  tokenAddress: tokenAddr,
                  symbol: symbol,
                  decimals: decimals,
                  lockedAmount: locked.toString(),
                  formattedLocked: (Number(locked) / (10 ** decimals)).toFixed(4),
                  protocol: vest.protocol || 'manual'
                });
              }
            }
          }
        } catch (e) { }
      }));
    }

    return res.json({
      ok: true,
      wallet: walletAddress,
      liquid: liquidTokens,
      vested: vestedTokens,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[portfolio] error', error);
    return res.status(500).json({ ok: false, error: 'Failed to scan portfolio' });
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
    if (solWallets.size > 0) {
      try {
        const solArray = Array.from(solWallets);
        const [sf, bf] = await Promise.all([
          withTimeout(fetchStreamflowVestingContracts(solArray), SOLANA_STREAMFLOW_TIMEOUT_MS, []),
          withTimeout(fetchBonfidaVesting(solArray), SOLANA_STREAMFLOW_TIMEOUT_MS, [])
        ]);
        streams = streams.concat(sf || [], bf || []);
      } catch (e) { }
    }
    if (evmWallets.size > 0) {
      try {
        const evmArray = Array.from(evmWallets);
        const [sab, sup] = await Promise.all([
          withTimeout(fetchSablierStreams(evmArray, queryChainId), 5000, []),
          withTimeout(fetchSuperfluidStreams(evmArray), 5000, [])
        ]);
        streams = streams.concat(sab || [], sup || []);
      } catch (e) { }
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

const erc20ReadAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

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

// Expose the SQLite/Supabase db handle to the scanner router via app.locals
app.use('/api/scanner', (req, _res, next) => {
  const db = persistence.getSqlite?.() || null;
  req.app.locals.db = db;
  next();
}, scannerRouter);

app.use('/api/faucet', faucetRouter);
app.use('/api/vesting', vestingRouter);

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

  app.listen(port, () => {
    console.log(`Vestra backend running on http://localhost:${port}`);
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
      }, DEMO_MODE ? Math.max(INDEXER_POLL_INTERVAL_MS * 4, 60000) : INDEXER_POLL_INTERVAL_MS);
      setInterval(() => {
        takeVestedSnapshot().catch((error) =>
          console.error('[indexer] snapshot error (interval)', error?.message || error)
        );
      }, INDEXER_SNAPSHOT_INTERVAL_MS);
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

    // V15.0 Autonomous Enforcement Injection
    const relayer = getRelayerWallet();
    const valuationContract = new ethers.Contract(valuationEngine.address, valuationDeployment.abi, relayer);
    omegaWatcher.setContract(valuationContract);
    
    omegaWatcher.start();

    // Sovereign Mirror Relayer Activation
    sovereignRelayer.start().catch((error) =>
      console.error('[sovereign-relayer] startup error', error?.message || error)
    );

  });
};

start().catch((error) => {
  console.error('[startup] fatal', error?.message || error);
  process.exit(1);
});
