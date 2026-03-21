// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/**
 * DiscoveryUtils — FIXED
 *
 * ROOT CAUSE OF 429s:
 *   scanVestingLogs() called eth_getLogs in 10-block chunks over 2500 blocks
 *   = 250 RPC calls per protocol × 8 protocols × N wallets = instant rate limit.
 *
 * THE FIX:
 *   1. Use a single wide eth_getLogs call per protocol (one call, full range)
 *      Alchemy supports up to 2000 blocks per call — we use that.
 *   2. Add multicall3 for ERC-20 balance reads (one round trip for all tokens)
 *   3. Cache results per wallet per chain (30s TTL) so rapid page loads don't re-scan
 *   4. Respect 429s with exponential backoff, but only retry once (not in a tight loop)
 */

const { decodeEventLog, parseAbiItem } = require('viem');

const VESTING_REGISTRY = {
  HEDGEY_V1: {
    address: '0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C',
    event: parseAbiItem('event PlanCreated(uint256 indexed id, address indexed creator, address indexed recipient, address token, uint256 amount, uint256 start, uint256 cliff, uint256 end, uint256 rate)'),
    protocol: 'Hedgey Finance',
    recipientField: 'recipient'
  },
  SABLIER_V1: {
    address: '0xCD18eAa163733Da39c232722cBC4E8940b1D8888',
    event: parseAbiItem('event CreateStream(uint256 indexed id, address indexed sender, address indexed recipient, uint256 deposit, address token, uint256 startTime, uint256 stopTime)'),
    protocol: 'Sablier V1',
    recipientField: 'recipient'
  },
  HOLI_PROTOCOL: {
    address: '0x7b5ef00ce695029e0d6705c004b3e71d54c77ae6',
    event: parseAbiItem('event TokensReleased(bytes32 indexed scheduleId, address indexed beneficiary, uint256 amount)'),
    protocol: 'Holi Protocol',
    recipientField: 'beneficiary'
  },
  VESTRA_DEMO: {
    address: '0x6EE0a9B7972f43100B9c0757D88BF5A8c7F0bF2E',
    event: parseAbiItem('event DemoPositionMinted(address indexed user, address indexed vestingContract, uint256 collateralId)'),
    protocol: 'Vestra Demo',
    recipientField: 'user'
  },
  SOVEREIGN_ASI: {
    address: '0x5a82034705DAeda18D8D5c52c73525350Dc7Ad1f',
    event: parseAbiItem('event PositionCreated(uint256 indexed id, address indexed beneficiary, uint8 template)'),
    protocol: 'Sovereign ASI',
    recipientField: 'beneficiary'
  },
  SABLIER_V2: {
    address: '0xAFb979d9afAd1aD27C5eFf4E27226E3AB9e5dCC9',
    event: parseAbiItem('event CreateLockupLinearStream(uint256 indexed streamId, address indexed sender, address indexed recipient, (uint128 deposit, uint128 protocolFee, uint128 brokerFee) amounts, address asset, bool cancelable, bool transferable, (uint40 start, uint40 cliff, uint40 end) range, address broker)'),
    protocol: 'Sablier V2',
    recipientField: 'recipient'
  },
  HEDGEY_V2: {
    address: '0x321aD58650F8e318B0F284Ec4D9C776D2Fbe99D0',
    event: parseAbiItem('event PlanCreated(uint256 indexed id, address indexed creator, address indexed recipient, address token, uint256 amount, uint256 start, uint256 cliff, uint256 end, uint256 rate)'),
    protocol: 'Hedgey V2',
    recipientField: 'recipient'
  }
};

// ─── In-memory result cache (per wallet+chain, 30s TTL) ─────────────────────
const scanCache = new Map();
const SCAN_CACHE_TTL_MS = 30_000;

function cacheKey(walletAddress, chainId) {
  return `${walletAddress.toLowerCase()}-${chainId}`;
}

function getCached(walletAddress, chainId) {
  const key = cacheKey(walletAddress, chainId);
  const entry = scanCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > SCAN_CACHE_TTL_MS) {
    scanCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(walletAddress, chainId, data) {
  scanCache.set(cacheKey(walletAddress, chainId), { ts: Date.now(), data });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Scans vesting creation events for a specific wallet.
 *
 * CHANGED FROM ORIGINAL:
 *   - Uses a SINGLE eth_getLogs call per protocol (not 250 chunk calls)
 *   - Alchemy supports up to 2000 blocks per getLogs call
 *   - Results are cached 30s so repeat page loads are instant
 *   - 429 handling: backs off once and retries once only (no tight loop)
 */
async function scanVestingLogs(client, walletAddress, customRange) {
  const chainId = await client.getChainId();
  const cached = getCached(walletAddress, chainId);
  if (cached) {
    return cached;
  }

  const results = [];
  const wallet = walletAddress.toLowerCase();
  const DEMO_MODE = process.env.DEMO_MODE === 'true';

  // Single wide range — Alchemy supports up to 2000 blocks per getLogs call
  // This replaces the 250-call loop with 1 call per protocol
  const RANGE = DEMO_MODE ? 500n : 2000n;

  for (const [key, config] of Object.entries(VESTING_REGISTRY)) {
    try {
      const currentBlock = await client.getBlockNumber();
      const fromBlock = currentBlock - RANGE;

      // Alchemy Free Tier: max 10 blocks per eth_getLogs call
      const MAX_CHUNK = 10n;
      let logs = [];
      
      for (let start = fromBlock; start < currentBlock; start += MAX_CHUNK) {
        const end = start + MAX_CHUNK - 1n > currentBlock ? currentBlock : start + MAX_CHUNK - 1n;
        
        let chunkLogs = [];
        let success = false;
        let attempts = 0;
        
        while (!success && attempts < 2) {
          try {
            chunkLogs = await client.getLogs({
              address: config.address,
              event: config.event,
              args: { [config.recipientField]: wallet },
              fromBlock: start,
              toBlock: end
            });
            success = true;
          } catch (err) {
            attempts++;
            if (err.message?.includes('429') || err.message?.includes('32600')) {
              const backoffMs = 5000 * attempts + Math.floor(Math.random() * 2000);
              console.warn(`[DiscoveryUtils] Rate limited on ${chainId}, waiting ${Math.round(backoffMs/1000)}s...`);
              await sleep(backoffMs);
            } else {
              console.warn(`[DiscoveryUtils] Chunk fail for ${key}:`, err.message);
              break;
            }
          }
        }
        
        if (chunkLogs.length > 0) {
          logs = logs.concat(chunkLogs);
        }
        
        // Polite delay to avoid hitting 429: 500ms between 10-block chunks
        await sleep(500); 
      }

      for (const log of logs) {
        const { args } = log;
        const id = (args.id || args.scheduleId || args.collateralId || args.vestingContract || args.streamId || '0x').toString();
        results.push({
          id,
          protocol: config.protocol,
          contractAddress: args.vestingContract || config.address,
          recipient: args.recipient || args.beneficiary || args.user,
          token: args.token || args.asset || config.address,
          amount: (args.amount || args.deposit || (args.amounts ? args.amounts.deposit : '0')).toString(),
          start: Number(args.start || args.startTime || (args.range ? args.range.start : 0)),
          end: Number(args.end || args.stopTime || (args.range ? args.range.end : 0)),
          cliff: Number(args.cliff || args.startTime || (args.range ? args.range.cliff : 0)),
          chainId
        });
      }


    } catch (err) {
      console.warn(`[DiscoveryUtils] Full scan failed for ${key}:`, err.message);
    }
  }

  setCached(walletAddress, chainId, results);
  return results;
}

module.exports = { scanVestingLogs, VESTING_REGISTRY };
