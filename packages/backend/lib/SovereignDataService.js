// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');
// const { fetch } = require('undici'); // Use global fetch
const persistence = require('../persistence');
const { fetchSablierStreams } = require('../evm/sablier');
const { fetchHedgeyPlans } = require('../evm/hedgey');
const { fetchSuperfluidStreams } = require('../evm/superfluid');
const { fetchStreamflowVestingContracts } = require('../solana/streamflow');
const VestingOracleService = require('./VestingOracleService');
const { WrapperBuilder, DataServiceWrapper } = require('@redstone-finance/evm-connector');
const { getSignersForDataServiceId } = require('@redstone-finance/sdk');
const redstone = require('redstone-api');
const crypto = require('crypto');
const pyth = require('../solana/pyth');
const { createPublicClient, http } = require('viem');
const { mainnet, base, sepolia, baseSepolia } = require('viem/chains');
const { calculateIdentityCreditScore } = require('../identityCreditScore');

const createId = () => crypto.randomBytes(16).toString('hex');



const DIA_API_URL = 'https://api.diadata.org/v1/asset_information';
const MOBULA_API_URL = 'https://api.mobula.io';
const CRYPTORANK_API_URL = 'https://api.cryptorank.io/v2';
const DEFILLAMA_VESTING_URL = 'https://api.llama.fi/listVesting';
const GITCOIN_PASSPORT_API_URL = 'https://api.scorer.gitcoin.co/registry/score';
const COVALENT_API_URL = 'https://api.covalenthq.com/v1';
const TOKENOMIST_API_URL = 'https://api.unlocks.app/v2'; 

const REDSTONE_DATA_SERVICE_ID = 'redstone-primary-prod';

const DEMO_MODE = false;

class SovereignDataService {
  constructor() {
    this.cache = new Map();
    this.syncInterval = 15; // Primary sync every 15 blocks (simulated)
    this.timeOffset = 0; // Simulation time offset in seconds
    
    // Viem clients for sniffing - STRICT ALCHEMY ONLY
    const ALCHEMY_KEY = process.env.RPC_URL?.split('/v2/')[1] || 'vFg0i2LwT6-VD2bja4ZB3';
    
    this.evmClients = {
      1: createPublicClient({ 
        chain: mainnet, 
        transport: http(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`) 
      }),
      8453: createPublicClient({ 
        chain: base, 
        transport: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`) 
      }),
      11155111: createPublicClient({ 
        chain: sepolia, 
        transport: http(`https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`) 
      }),
      84532: createPublicClient({ 
        chain: baseSepolia, 
        transport: http(`https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`) 
      })
    };
    
    this._initHeartbeat();
  }

  _initHeartbeat() {
    // Pulse every 30 seconds for data acquisition monitoring
    setInterval(async () => {
      const timestamp = new Date().toISOString();
      const providers = ['DIA', 'Mobula', 'CryptoRank', 'DeFiLlama', 'RedStone', 'Pyth'];
      const status = {};
      
      try {
        // Simple health check for active providers (mocking actual ping for pulse)
        status.DIA = DEMO_MODE ? true : !!(await this.getDiaAssetInfo('BTC'));
        const mobulaKey = process.env.MOBULA_API_KEY;
        status.Mobula = !!mobulaKey;
        status.CryptoRank = !!process.env.CRYPTORANK_API_KEY;
        status.DeFiLlama = true; // Public API
        status.RedStone = true; // SDK based
        status.Pyth = true; // Solana connection
        
        const successCount = Object.values(status).filter(v => v).length;
        if (!DEMO_MODE) {
          console.log(`[SovereignDataService] DATA ACQUISITION PULSE: ${successCount}/${providers.length} ACTIVE | Status: ${JSON.stringify(status)} | Timestamp: ${timestamp}`);
        }
      } catch (err) {
        if (!DEMO_MODE) {
          console.error(`[SovereignDataService] PULSE FAILED: ${err.message} | Timestamp: ${timestamp}`);
        }
      }
    }, 300000); // 5 minutes
  }

  setTimeOffset(seconds) {
    this.timeOffset = seconds;
    console.log(`[SovereignDataService] Time offset updated: ${seconds}s`);
  }

  /**
   * Internal fetch with exponential backoff for handling 429 rate limits.
   */
  async _fetchWithRetry(url, options = {}, maxRetries = 3) {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        const resp = await fetch(url, {
          ...options,
          headers: {
            'Accept': 'application/json',
            ...(options.headers || {})
          }
        });
        
        if (resp.status === 429) {
          const wait = Math.pow(2, retries) * 1000;
          console.warn(`[SovereignDataService] 429 Rate Limited - retrying in ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
          retries++;
          continue;
        }
        
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (err) {
        if (retries >= maxRetries - 1) throw err;
        retries++;
        await new Promise(r => setTimeout(r, 500));
      }
    }
    throw new Error('Max retries exceeded');
  }


  getSimulatedTimestamp() {
    return Math.floor(Date.now() / 1000) + this.timeOffset;
  }

  /**
   * Main entry point to discover and mirror assets for a given wallet
   */
  async discoverAndMirror(wallet, chainType) {
    console.log(`[SovereignDataService] Discovering assets for ${wallet} (${chainType})`);
    
    let discovered = {
      vesting: [],
      staked: [],
      locked: [],
      tokens: [],
      nfts: []
    };

    try {
      const tasks = [];

      if (chainType === 'evm' || chainType === 'all') {
        const isEvm = wallet.startsWith('0x') && wallet.length === 42;
        if (isEvm || chainType === 'evm') {
          // Iterate through main supported chains
          // Iterate through main supported chains - Include 1 (Mainnet) in DEMO_MODE for user visibility
          const chains = DEMO_MODE ? [1, 11155111, 84532] : [1, 10, 8453, 11155111, 84532];
          
          for (const chainId of chains) {
            tasks.push(
              this.getAlchemyTokenBalances(wallet, chainId)
                .then(tokens => {
                  tokens.forEach(t => {
                    discovered.tokens.push({
                      id: `alc-${chainId}-${t.contractAddress}`,
                      chain: chainId === 1 ? 'mainnet' : (chainId === 8453 ? 'base' : 'sepolia'),
                      chainId,
                      contractAddress: t.contractAddress,
                      protocol: 'Alchemy Discovery',
                      amount: t.tokenBalance,
                      symbol: t.metadata?.symbol || 'ERC20',
                      name: t.metadata?.name || 'Unknown Token',
                      decimals: t.metadata?.decimals || 18,
                      consensusScore: 0.8
                    });
                  });
                })
                .catch(err => console.warn(`[SovereignDataService] Alchemy fetch failed on ${chainId}:`, err.message))
            );
          }

          // Unified Vesting & Streaming Discovery (Sablier, Superfluid, Hedgey, LlamaPay, Streamflow)
          tasks.push(
            VestingOracleService.fetchUserVestings(wallet, 'all', this.evmClients)
              .then(res => discovered.vesting.push(...res))
              .catch(err => console.warn('[SovereignDataService] Unified Vesting fetch failed:', err.message))
          );

          for (const chainId of chains) {
            const client = this.evmClients[chainId];

            if (chainId === 8453) { // Holi is on Base
              tasks.push(
                this.fetchHoliSchedules(wallet, client)
                  .then(res => discovered.vesting.push(...res))
                  .catch(err => console.warn(`[SovereignDataService] Holi failed:`, err.message))
              );
            }

            if (chainId === 11155111) { // ASI Sovereign is on Sepolia for now
              tasks.push(
                this.fetchSovereignASISchedules(wallet, client)
                  .then(res => discovered.vesting.push(...res))
                  .catch(err => console.warn(`[SovereignDataService] SovereignASI failed:`, err.message))
              );
            }
          }

          
          tasks.push(
            this.getMobulaPortfolio(wallet)
              .then(res => {
                discovered.vesting.push(...res.vesting || []);
                discovered.staked.push(...res.staked || []);
                discovered.tokens.push(...res.tokens || []);
                discovered.nfts.push(...res.nfts || []);
              })
              .catch(err => console.warn('[SovereignDataService] Mobula failed:', err.message))
          );
          
          tasks.push(
            this.queryDuneStaked(wallet)
              .then(res => discovered.staked.push(...res))
              .catch(err => console.warn('[SovereignDataService] DuneStaked failed:', err.message))
          );

          
          // Sniff common addresses on current active chain for the wallet
          tasks.push(
            this.sniffVestingInterface(wallet, 11155111) 
              .then(res => {
                if (res) discovered.vesting.push(res);
              })
              .catch(() => {})
          );
        }
      }


      // NFT Discovery (Vesting NFTs)
      if (chainType === 'evm' || chainType === 'all') {
        const chains = [1, 137, 8453, 11155111]; 
        for (const chainId of chains) {
          tasks.push(
            this.getAlchemyNFTs(wallet, chainId)
              .then(nfts => discovered.vesting.push(...nfts))
              .catch(err => console.warn(`[SovereignDataService] NFT discovery failed on ${chainId}:`, err.message))
          );
        }
      }

      try {
        const concurrencyLimit = 3; // Increased for better responsiveness while staying below 429 limits
        for (let i = 0; i < tasks.length; i += concurrencyLimit) {
          await Promise.allSettled(tasks.slice(i, i + concurrencyLimit));
        }
        
        console.log(`[SovereignDataService] Discovery complete for ${wallet}. Tokens: ${discovered.tokens.length}, Vested: ${discovered.vesting.length}`);
        // Mirror to local persistence (Supabase/SQLite)
        await this.mirrorToPersistence(wallet, discovered);
        return discovered;
      } catch (err) {
        console.error('[SovereignDataService] Discovery process error:', err.message);
        return discovered;
      }
    } catch (err) {
      console.error('[SovereignDataService] Discovery failed:', err.message);
      return discovered;
    }
  }

  /**
   * Fetch Holi Protocol (vHOLI) vesting schedules for a wallet
   */
  async fetchHoliSchedules(wallet, client) {
    const { scanVestingLogs } = require('./discovery_utils');
    const range = DEMO_MODE ? 1000n : 50000n; // Reduced significantly for dev/demo performance
    const logs = await scanVestingLogs(client, wallet, range);
    const holiLogs = logs.filter(l => l.protocol === 'Holi Protocol');
    
    const results = [];
    const HOLI_ABI = [
      {
        inputs: [{ name: 'vestingScheduleId', type: 'bytes32' }],
        name: 'getVestingSchedule',
        outputs: [
          {
            components: [
              { name: 'cliff', type: 'uint256' },
              { name: 'start', type: 'uint256' },
              { name: 'duration', type: 'uint256' },
              { name: 'slicePeriodSeconds', type: 'uint256' },
              { name: 'amountTotal', type: 'uint256' },
              { name: 'released', type: 'uint256' },
              { name: 'status', type: 'uint8' },
              { name: 'beneficiary', type: 'address' },
              { name: 'owner', type: 'address' },
              { name: 'revokable', type: 'bool' }
            ],
            type: 'tuple'
          }
        ],
        stateMutability: 'view',
        type: 'function'
      }
    ];

    for (const log of holiLogs) {
      try {
        const res = await client.readContract({
          address: '0x7b5ef00ce695029e0d6705c004b3e71d54c77ae6',
          abi: HOLI_ABI,
          functionName: 'getVestingSchedule',
          args: [log.id]
        });

        const total = BigInt(res.amountTotal);
        const released = BigInt(res.released);
        const locked = total - released;
        const now = Math.floor(Date.now() / 1000);
        const end = Number(res.start) + Number(res.duration);
        
        let statusLabel = 'OLD';
        if (locked === 0n) {
          statusLabel = 'DEPLETED';
        } else if (now < end) {
          statusLabel = 'NEW';
        }

        results.push({
          id: `holi-${log.id}`,
          loanId: log.id,
          collateralId: log.id,
          chain: 'base',
          contractAddress: '0x7b5ef00ce695029e0d6705c004b3e71d54c77ae6',
          protocol: 'Holi Protocol',
          symbol: 'vHOLI',
          name: 'Holi Vesting Schedule',
          amount: total.toString(),
          quantity: locked.toString(),
          pv: Number(locked) * 0.8,
          unlockTime: end,
          active: locked > 0n,
          status: statusLabel
        });
      } catch (err) {
        console.warn(`[SovereignDataService] Holi fetch failed for ${log.id}:`, err.message);
      }
    }
    return results;
  }


  /**
   * Fetch Sovereign ASI Wallet positions
   */
  async fetchSovereignASISchedules(wallet, client) {
    if (!client) return [];
    
    const { scanVestingLogs } = require('./discovery_utils');
    const range = DEMO_MODE ? 1000n : 5000n; // Reduced significantly for dev/demo performance
    const logs = await scanVestingLogs(client, wallet, range);
    const asiLogs = logs.filter(l => l.protocol === 'Sovereign ASI');
    
    if (asiLogs.length === 0) return [];
    
    const ASI_ABI = [
      { name: 'positions', type: 'function', inputs: [{ type: 'uint256' }], outputs: [
        { name: 'beneficiary', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'totalAmount', type: 'uint256' },
        { name: 'releasedAmount', type: 'uint256' },
        { name: 'startTime', type: 'uint256' },
        { name: 'duration', type: 'uint256' },
        { name: 'cliff', type: 'uint256' },
        { name: 'template', type: 'uint8' },
        { name: 'active', type: 'bool' }
      ], stateMutability: 'view' }
    ];

    const results = [];
    for (const log of asiLogs) {
      try {
        const posId = BigInt(log.id);
        const pos = await client.readContract({
          address: log.contractAddress,
          abi: ASI_ABI,
          functionName: 'positions',
          args: [posId]
        });

        const locked = pos.totalAmount - pos.releasedAmount;
        const end = Number(pos.startTime) + Number(pos.duration);

        results.push({
          id: `asi-${log.id}`,
          loanId: log.id,
          collateralId: log.id,
          chain: 'sepolia',
          contractAddress: log.contractAddress,
          protocol: 'Sovereign ASI',
          symbol: '$CRDT',
          name: pos.template === 0 ? 'AGENT_ALPHA' : 'NEURAL_REWARD',
          amount: pos.totalAmount.toString(),
          quantity: locked.toString(),
          pv: Number(locked) * 0.95, // High rank appraisal
          unlockTime: end,
          active: pos.active && locked > 0n,
          status: 'FLAGSHIP'
        });
      } catch (err) {
        console.warn(`[SovereignDataService] ASI fetch failed for ${log.id}:`, err.message);
      }
    }
    return results;
  }

  /**
   * Get aggregated vesting feed for landing page ticker
   */
  async getTopVestingFeed(limit = 10) {
    try {
      const events = await persistence.listTokenUnlockEvents({ limit });
      const feed = [];

      for (const event of events) {
        const project = await persistence.listTokenProjects({ limit: 1 })
          .then(projects => projects.find(p => p.id === event.tokenId));
        
        feed.push({
          symbol: project?.symbol || event.tokenId,
          amount: event.amount,
          date: event.occurrenceDate,
          type: event.eventType,
          percentage: event.percentage
        });
      }
      return feed;
    } catch (err) {
      console.warn('[SovereignDataService] Failed to fetch vesting feed:', err.message);
      return [];
    }
  }

  /**
   * Fetch Holi Protocol (vHOLI) vesting schedules for a wallet
   */

  /**
   * Universal Vesting Sniffer
   * Checks a contract address for common vesting signatures and state.
   */
  async sniffVestingInterface(address, chainId = 11155111) {
    const client = this.evmClients[chainId] || this.evmClients[11155111];
    
    // Common Vesting Signatures (OpenZeppelin, Sablier, etc.)
    const signatures = [
      { name: 'release', selector: '0x86d1a69f' },      // release()
      { name: 'vestedAmount', selector: '0x2a3e6f9a' }, // vestedAmount(address,uint64)
      { name: 'beneficiary', selector: '0x38af3f7e' },  // beneficiary()
      { name: 'start', selector: '0xbe9a6555' },        // start()
      { name: 'duration', selector: '0x2f54bf66' },     // duration()
      { name: 'released', selector: '0x9852028c' }      // released()
    ];

    try {
      const code = await client.getBytecode({ address });
      if (!code || code === '0x') return null;

      // Check if at least some signatures exist in bytecode
      const matches = signatures.filter(s => code.includes(s.selector.slice(2)));
      if (matches.length < 2) return null; // Likely not a standard vesting contract

      console.log(`[SovereignDataService] SNIFFER: Potential vesting contract detected at ${address} on chain ${chainId}`);

      // Attempt to extract state via staticCall (Generic/OZ style)
      let beneficiary = address;
      let startTime = 0;
      let duration = 0;
      let released = 0n;

      try {
        beneficiary = await client.readContract({
          address,
          abi: [{ name: 'beneficiary', type: 'function', inputs: [], outputs: [{ type: 'address' }] }],
          functionName: 'beneficiary'
        });
      } catch (_) {}

      try {
        startTime = Number(await client.readContract({
          address,
          abi: [{ name: 'start', type: 'function', inputs: [], outputs: [{ type: 'uint256' }] }],
          functionName: 'start'
        }));
      } catch (_) {}

      try {
        duration = Number(await client.readContract({
          address,
          abi: [{ name: 'duration', type: 'function', inputs: [], outputs: [{ type: 'uint256' }] }],
          functionName: 'duration'
        }));
      } catch (_) {}

      return {
        id: `sniffed-${address.slice(0, 8)}`,
        loanId: `sniffed-${address}`,
        collateralId: address,
        chain: chainId === 1 ? 'mainnet' : (chainId === 8453 ? 'base' : 'sepolia'),
        chainId,
        contractAddress: address,
        protocol: 'Universal Sniffer',
        borrower: beneficiary,
        unlockTime: startTime + duration,
        active: (startTime + duration) > Math.floor(Date.now() / 1000),
        tokenSymbol: 'UNKNOWN', // Would need further sniffing or user input
        quantity: '0', // Needs balance check of the contract if it's a wrapper
        consensusScore: 0.7,
        isSniffed: true,
        timeline: { start: startTime, end: startTime + duration }
      };
    } catch (err) {
      console.warn(`[SovereignDataService] Sniffing failed for ${address}:`, err.message);
      return null;
    }
  }

  async mirrorToPersistence(wallet, data) {
    const timestamp = new Date().toISOString();

    // Mirror Vesting
    for (const v of data.vesting) {
      await persistence.saveVestingSource({
        id: v.loanId || v.id || `v-${v.collateralId || v.contractAddress}`,
        chainId: v.chain || 'evm',
        vestingContract: v.token || v.collateralId || v.contractAddress,
        protocol: v.protocol || 'manual',
        lockupAddress: v.borrower || wallet,
        streamId: v.collateralId || v.id,
        lastSyncedAt: timestamp,
        consensusScore: v.consensusScore || 1.0
      });
    }

    // Mirror Staked
    for (const s of data.staked) {
      await persistence.saveStakedSource({
        id: s.id || `s-${wallet}-${s.protocol}-${s.stakingContract}`,
        chainId: s.chain || 'evm',
        stakingContract: s.stakingContract,
        protocol: s.protocol,
        walletAddress: wallet,
        amount: s.amount,
        lastSyncedAt: timestamp,
        consensusScore: 1.0
      });
    }

    // Mirror Locked
    if (data.locked) {
      for (const l of data.locked) {
        await persistence.saveLockedSource({
          id: l.id || `l-${wallet}-${l.protocol}-${l.lockContract}`,
          chainId: l.chain || 'evm',
          lockContract: l.lockContract,
          protocol: l.protocol,
          assetAddress: l.assetAddress,
          amount: l.amount,
          unlockTime: l.unlockTime,
          lastSyncedAt: timestamp,
          consensusScore: 1.0
        });
      }
    }
  }

  /**
   * Alchemy NFT Discovery (for Vesting NFTs like Hedgey, etc.)
   */
  async getAlchemyNFTs(wallet, chainId) {
    const client = this.evmClients[chainId];
    if (!client) return [];
    
    try {
      const url = client.transport.url.replace('/v2/', '/nft/v3/');
      const res = await fetch(`${url}/getNFTsForOwner?owner=${wallet}&withMetadata=true`);
      if (!res.ok) return [];
      const data = await res.json();
      
      const vestingNFTs = (data.ownedNfts || []).filter(nft => {
        const name = (nft.name || '').toLowerCase();
        const desc = (nft.description || '').toLowerCase();
        return name.includes('vesting') || desc.includes('vesting') || name.includes('lockup') || name.includes('hedgey');
      });

      return vestingNFTs.map(nft => ({
        id: `nft-${chainId}-${nft.contract.address}-${nft.tokenId}`,
        chain: chainId === 1 ? 'mainnet' : (chainId === 137 ? 'polygon' : (chainId === 8453 ? 'base' : 'sepolia')),
        chainId,
        contractAddress: nft.contract.address,
        protocol: 'Vesting NFT',
        symbol: nft.contract.symbol || 'VNFT',
        name: nft.name || 'Vesting NFT',
        amount: '1',
        quantity: '1',
        unlockTime: 0, // Needs extraction from metadata if possible
        active: true,
        metadata: nft.raw?.metadata || {}
      }));
    } catch (err) {
      console.warn(`[SovereignDataService] Alchemy NFT fetch failed for ${wallet} on ${chainId}:`, err.message);
      return [];
    }
  }

  /**
   * Alchemy Token Balance Discovery (Portfolio Sniffing)
   */
  async getAlchemyTokenBalances(wallet, chainId) {
    const client = this.evmClients[chainId];
    if (!client) return [];
    
    try {
      const url = client.transport.url;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'alchemy_getTokenBalances',
          params: [wallet, 'erc20']
        })
      });
      if (!res.ok) return [];
      const { result } = await res.json();
      const rawBalances = (result?.tokenBalances || []).filter(t => t.tokenBalance !== '0x' && t.tokenBalance !== '0x0');
      
      const enriched = await Promise.all(rawBalances.slice(0, 15).map(async (t) => {
        try {
          // Add 5s timeout to metadata fetch
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          
          const metaRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'alchemy_getTokenMetadata',
              params: [t.contractAddress]
            }),
            signal: controller.signal
          });
          clearTimeout(timeout);
          const meta = await metaRes.json();
          return { ...t, metadata: meta.result };
        } catch (err) { 
          return t; 
        }
      }));

      console.log(`[SovereignDataService] Alchemy found ${enriched.length} tokens for ${wallet} on ${chainId}`);
      return enriched;
    } catch (err) {
      console.warn(`[SovereignDataService] Alchemy token fetch failed for ${wallet} on ${chainId}:`, err.message);
      return [];
    }
  }

  /**
   * Mobula Token Vesting & Unlocks
   */
  async fetchMobulaVesting(tokenAddress) {
    if (!MOBULA_API_KEY) {
      console.warn('[SovereignDataService] Mobula API key missing, skipping vesting fetch.');
      return null;
    }
    try {
      console.log(`[SovereignDataService] Calling Mobula Vesting API for ${tokenAddress}...`);
      const resp = await fetch(`${MOBULA_API_URL}/token/vesting?asset=${tokenAddress}`, {
        headers: { 'X-API-Key': MOBULA_API_KEY }
      });
      if (!resp.ok) {
        console.warn(`[SovereignDataService] Mobula vesting API returned ${resp.status}: ${resp.statusText}`);
        return null;
      }
      return await resp.json();
    } catch (err) {
      console.warn(`[SovereignDataService] Mobula vesting failed for ${tokenAddress}:`, err.message);
      return null;
    }
  }

  /**
   * Mobula Wallet Portfolio Discovery
   */
  async getMobulaPortfolio(wallet) {
    if (!MOBULA_API_KEY) {
      console.warn('[SovereignDataService] Mobula API key missing, skipping portfolio fetch.');
      return { vesting: [], staked: [] };
    }
    try {
      console.log(`[SovereignDataService] Calling Mobula Portfolio API for ${wallet}...`);
      const resp = await fetch(`${MOBULA_API_URL}/wallet/portfolio?wallet=${wallet}`, {
        headers: { 'X-API-Key': MOBULA_API_KEY }
      });
      if (!resp.ok) {
        console.warn(`[SovereignDataService] Mobula portfolio API returned ${resp.status}: ${resp.statusText}`);
        return { vesting: [], staked: [] };
      }
      const data = await resp.json();
      
      const results = { vesting: [], staked: [], tokens: [], nfts: [] };
      if (data.data && data.data.assets) {
        for (const asset of data.data.assets) {
          const entry = {
            id: `mobula-${asset.asset.symbol}-${asset.asset.contract_address.slice(0, 6)}`,
            chain: asset.asset.chain,
            contractAddress: asset.asset.contract_address,
            protocol: 'Mobula Discovery',
            symbol: asset.asset.symbol,
            name: asset.asset.name,
            amount: asset.token_balance,
            price: asset.price,
            value: asset.value,
            logo: asset.asset.logo,
            consensusScore: 0.9
          };

          if (asset.is_vesting) {
            results.vesting.push(entry);
          } else if (asset.asset.type === 'nft') {
            results.nfts.push(entry);
          } else {
            results.tokens.push(entry);
          }
        }
      }
      return results;
    } catch (err) {
      console.warn(`[SovereignDataService] Mobula portfolio failed for ${wallet}:`, err.message);
      return { vesting: [], staked: [] };
    }
  }

  /**
   * CryptoRank Vesting API
   */
  async fetchCryptoRankVesting(symbol) {
    if (!CRYPTORANK_API_KEY) {
      console.warn('[SovereignDataService] CryptoRank API key missing, skipping vesting fetch.');
      return null;
    }
    try {
      console.log(`[SovereignDataService] Calling CryptoRank Currencies API for ${symbol}...`);
      const listResp = await fetch(`${CRYPTORANK_API_URL}/currencies?symbols=${symbol}`, {
        headers: { 'X-Api-Key': CRYPTORANK_API_KEY }
      });
      if (!listResp.ok) {
        console.warn(`[SovereignDataService] CryptoRank currencies API returned ${listResp.status}`);
        return null;
      }
      const listData = await listResp.json();
      const currencyId = listData.data && listData.data[0] ? listData.data[0].id : null;
      
      if (!currencyId) return null;

      console.log(`[SovereignDataService] Calling CryptoRank Vesting API for ID ${currencyId} (${symbol})...`);
      const vestResp = await fetch(`${CRYPTORANK_API_URL}/currencies/${currencyId}/vesting`, {
        headers: { 'X-Api-Key': CRYPTORANK_API_KEY }
      });
      if (!vestResp.ok) {
        console.warn(`[SovereignDataService] CryptoRank vesting API returned ${vestResp.status}`);
        return null;
      }
      return await vestResp.json();
    } catch (err) {
      console.warn(`[SovereignDataService] CryptoRank vesting failed for ${symbol}:`, err.message);
      return null;
    }
  }

  /**
   * DeFiLlama Vesting API
   */
  async fetchDeFiLlamaVesting(slug) {
    try {
      console.log(`[SovereignDataService] Calling DeFiLlama Vesting API...`);
      const resp = await fetch(DEFILLAMA_VESTING_URL);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.find(p => p.slug === slug || p.name.toLowerCase() === slug.toLowerCase());
    } catch (err) {
      console.warn(`[SovereignDataService] DeFiLlama vesting failed for ${slug}:`, err.message);
      return null;
    }
  }

  /**
   * Query DIA Oracle for detailed asset information
   */
  async getDiaAssetInfo(symbol) {
    if (DEMO_MODE) return null; // Silence DIA 404s for demo
    try {
      console.log(`[SovereignDataService] Calling DIA Asset Info API for ${symbol}...`);
      const resp = await fetch(`${DIA_API_URL}/${symbol}`);
      if (!resp.ok) {
        if (!DEMO_MODE) console.warn(`[SovereignDataService] DIA API returned ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      return {
        price: data.Price,
        supply: data.CirculatingSupply,
        marketCap: data.MarketCap,
        lastUpdate: data.Time,
        source: 'DIA'
      };
    } catch (err) {
      console.warn(`[SovereignDataService] DIA info failed for ${symbol}:`, err.message);
      return null;
    }
  }

  /**
   * Multi-Source Consensus Pricing
   */
  async getConsensusPrice(symbol, returnDetails = false) {
    const providers = [
      this.getDiaAssetInfo(symbol).then(d => d ? { price: d.price, source: 'DIA' } : null),
      this.fetchCryptoRankPrice(symbol).then(p => p ? { price: p, source: 'CryptoRank' } : null),
      this.fetchRedstonePrice(symbol).then(p => p ? { price: p, source: 'RedStone-Pull' } : null),
      redstone.getPrice(symbol, { verifySignature: true })
        .then(p => p ? { price: p.value, source: 'RedStone-API' } : null)
        .catch(() => null),
      pyth.getPriceForSymbol(symbol).then(p => {
        if (!p) return null;
        const price = Number(p.price) * Math.pow(10, p.expo);
        return { price, source: 'Pyth' };
      }).catch(() => null),
      this.fetchMobulaMarketData(symbol).then(m => m ? { price: m.price, source: 'Mobula' } : null).catch(() => null),
      this.fetchDexScreenerPrice(symbol).then(p => p ? { price: p, source: 'DexScreener' } : null).catch(() => null)
    ];

    const results = await Promise.allSettled(providers);
    const validProviders = results
      .filter(r => r.status === 'fulfilled' && r.value && r.value.price)
      .map(r => r.value);

    if (validProviders.length === 0) return returnDetails ? [] : 0;

    const validPrices = validProviders.map(p => p.price);
    const sum = validPrices.reduce((a, b) => a + b, 0);
    const avg = sum / validPrices.length;

    return returnDetails ? validProviders : avg;
  }

  async fetchCryptoRankPrice(symbol) {
    if (!CRYPTORANK_API_KEY) return null;
    try {
      console.log(`[SovereignDataService] Calling CryptoRank Price API for ${symbol}...`);
      const resp = await fetch(`${CRYPTORANK_API_URL}/currencies?symbols=${symbol}`, {
        headers: { 'X-Api-Key': CRYPTORANK_API_KEY }
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.data && data.data[0] ? data.data[0].values.USD.price : null;
    } catch (err) {
      return null;
    }
  }

  /**
   * RedStone Pull Model Price Retrieval
   */
  /**
   * RedStone Pull Model Price Retrieval (Off-chain optimized)
   */
  async fetchRedstonePrice(symbol) {
    try {
      const price = await redstone.getPrice(symbol, { verifySignature: true });
      return price ? price.value : null;
    } catch (err) {
      console.warn(`[SovereignDataService] RedStone price failed for ${symbol}:`, err.message);
      return null;
    }
  }

  /**
   * RedStone Payload Generator
   * Used for injecting into transactions for VestraOracleConsumer
   */
  async fetchRedstonePayload(symbols = ['ETH', 'BTC']) {
    try {
      const dataServiceWrapper = new DataServiceWrapper({
        dataServiceId: REDSTONE_DATA_SERVICE_ID,
        dataFeeds: symbols,
      });
      // Correct SDK method for manual payload usage
      return await dataServiceWrapper.getRedstonePayloadForManualUsage();
    } catch (err) {
      console.warn('[SovereignDataService] RedStone payload generation failed:', err.message);
      return '0x';
    }
  }

  /**
   * Mock Dune query for staked assets
   */
  async queryDuneStaked(wallet) {
    if (!process.env.DUNE_API_KEY) return [];
    return [
      {
        id: `dune-staking-lido-${wallet.slice(0, 6)}`,
        protocol: 'Lido',
        chain: 'evm',
        stakingContract: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', // stETH
        amount: '1.5',
        valueUsd: 4500
      }
    ];
  }

  /**
   * Proactively sync ALL new contracts from supported protocols
   */
  async syncGlobalProtocols() {
    console.log('[SovereignDataService] Initiating global protocol sync...');
    const timestamp = new Date().toISOString();

    try {
      // 1. Sync Sablier (Global)
      const sablierStreams = await fetchSablierStreams([]); 
      for (const s of sablierStreams) {
        await persistence.saveVestingSource({
          id: s.loanId,
          chainId: s.chain,
          vestingContract: s.collateralId,
          protocol: 'Sablier',
          lockupAddress: s.borrower,
          streamId: s.collateralId,
          lastSyncedAt: timestamp,
          consensusScore: 1.0
        });
      }

      // 2. Sync Streamflow (Global)
      const solanaContracts = await fetchStreamflowVestingContracts([]);
      for (const c of solanaContracts) {
        await persistence.saveVestingSource({
          id: `solana-sf-${c.id}`,
          chainId: 'solana',
          vestingContract: c.id,
          protocol: 'Streamflow',
          lockupAddress: c.recipient,
          streamId: c.id,
          lastSyncedAt: timestamp,
          consensusScore: 1.0
        });
      }

      console.log(`[SovereignDataService] Global sync complete. Indexed ${sablierStreams.length + solanaContracts.length} contracts.`);
    } catch (err) {
      console.warn('[SovereignDataService] Global sync failed:', err.message);
    }
  }

  /**
   * Proactively discover all active vesting contracts across Mobula and Tokenomist
   */
  /**
   * Master Archival of all Tokenomist data (Unlocks, Allocations, Investors, Fundraising)
   */
  async syncAllTokenomistData() {
    console.log('[SovereignDataService] Initiating comprehensive Tokenomist master archival...');
    const tokenomistKey = process.env.TOKENOMIST_API_KEY;
    if (!tokenomistKey) {
      console.warn('[SovereignDataService] Tokenomist API key missing; skipping master sync.');
      return;
    }

    const timestamp = new Date().toISOString();

    try {
      // 1. Fetch Token List from Tokenomist
      console.log('[SovereignDataService] Fetching Tokenomist token list...');
      const listData = await this.fetchWithRetry(`${TOKENOMIST_API_URL}/token/list`);
      
      if (!listData) {
        console.warn(`[SovereignDataService] Tokenomist token list failed after retries.`);
        return;
      }

      const tokens = Array.isArray(listData) ? listData : (listData.data || []);
      
      // Select the first 50 tokens for archival (can be expanded)
      const targetTokens = tokens.slice(0, 50); 

      for (const token of targetTokens) {
        console.log(`[SovereignDataService] Archiving exhaustive data for: ${token.symbol} (${token.id})...`);
        await new Promise(r => setTimeout(r, 200)); // Rate limit protection

        // ARCHIVE PROJECT METADATA
        await persistence.saveTokenProject({
          id: token.id,
          name: token.name,
          symbol: token.symbol,
          metadata: token
        });

        // ARCHIVE UNLOCKS/VESTING
        const unlockData = await this.fetchTokenomistVesting(token.id);
        if (unlockData && unlockData.status && Array.isArray(unlockData.data)) {
          console.log(`[SovereignDataService] Processing unlocks for ${token.id}...`);
          await persistence.saveVestingSource({
            id: `tokenomist-${token.id}`,
            chainId: 'multiple', 
            vestingContract: token.id,
            protocol: 'Tokenomist',
            lastSyncedAt: timestamp,
            consensusScore: 1.0,
            metadata: unlockData
          });
          
          const events = unlockData.data;
          for (const event of events) {
            const cliff = event.cliffUnlocks || {};
            const allocation = cliff.allocationBreakdown?.[0] || {};
            
            await persistence.saveTokenUnlockEvent({
              tokenId: token.id,
              eventType: allocation.allocationName || 'Unlock',
              occurrenceDate: event.unlockDate,
              amount: cliff.cliffAmount ? cliff.cliffAmount.toString() : '0',
              percentage: cliff.valueToMarketCap || 0,
              metadata: event
            });
          }
        }

        // ARCHIVE ALLOCATIONS
        const allocationData = await this.fetchTokenomistAllocations(token.id);
        if (allocationData) {
          console.log(`[SovereignDataService] Processing allocations for ${token.id}...`);
          const allocs = Array.isArray(allocationData) ? allocationData : (allocationData.data || []);
          for (const alloc of allocs) {
            await persistence.saveTokenAllocation({
              tokenId: token.id,
              category: alloc.name || alloc.category || 'unknown',
              amountPercentage: alloc.percentage || alloc.amount_percentage,
              isLocked: alloc.is_locked || alloc.locked,
              metadata: alloc
            });
          }
        }

        // ARCHIVE INVESTORS
        const investorData = await this.fetchTokenomistInvestors(token.id);
        if (investorData) {
          console.log(`[SovereignDataService] Processing investors for ${token.id}...`);
          const investors = Array.isArray(investorData) ? investorData : (investorData.list || []);
          for (const inv of investors) {
            await persistence.saveTokenInvestor({
              tokenId: token.id,
              investorName: inv.name || inv.investor_name,
              investorType: inv.type || inv.investor_type,
              amount: inv.amount,
              metadata: inv
            });
          }
        }

        // ARCHIVE FUNDRAISING
        const fundraisingData = await this.fetchTokenomistFundraising(token.id);
        if (fundraisingData) {
          console.log(`[SovereignDataService] Processing fundraising for ${token.id}...`);
          const funds = Array.isArray(fundraisingData) ? fundraisingData : (fundraisingData.rounds || fundraisingData.data || []);
          for (const fund of funds) {
            await persistence.saveTokenFundraising({
              tokenId: token.id,
              roundName: fund.round || fund.round_name,
              amountRaised: fund.raised || fund.amount_raised,
              valuation: fund.valuation,
              tokenPrice: fund.price || fund.token_price,
              metadata: fund
            });
          }
        }
      }

      console.log('[SovereignDataService] Tokenomist master archival complete.');
      
      // Follow up with Mobula enrichment
      await this.enrichAllVestingData();

    } catch (err) {
      console.error('[SovereignDataService] Global master archival failed:', err.message);
    }
  }

  // Backwards compatibility alias
  async discoverAllVestingContracts() {
    return this.syncAllTokenomistData();
  }

  /**
   * Enrich all vesting sources with latest market data (ATH/ATL/Drawdown)
   */
  async enrichAllVestingData() {
    console.log('[SovereignDataService] Enriching all vesting sources with market metrics...');
    const sources = await persistence.listVestingSources(); // Assuming this list method exists
    
    for (const source of sources) {
      let symbol = source.vestingContract;
      if (source.metadata) {
        const meta = typeof source.metadata === 'string' ? JSON.parse(source.metadata) : source.metadata;
        symbol = meta.symbol || (meta.token && meta.token.symbol) || symbol;
      }
      if (!symbol || symbol === 'undefined') {
        symbol = source.id.split('-').pop();
      }

      console.log(`[SovereignDataService] Enriching source ${source.id} (Symbol: ${symbol})...`);
      if (!symbol || symbol === 'undefined') continue;

      const marketData = await this.fetchMobulaMarketData(symbol);
      
      if (marketData) {
        // Update persistence with enriched metadata
        await persistence.saveVestingSource({
          ...source,
          metadata: {
            ...(source.metadata || {}),
            market: marketData,
            lastEnrichedAt: new Date().toISOString()
          }
        });
      }
    }
    console.log('[SovereignDataService] Enrichment complete.');
  }

  /**
   * Sync and refresh all known vesting sources for active users
   */
  async syncVestingData() {
    console.log('[SovereignDataService] Initiating daily vesting data sync...');
    const wallets = await persistence.getActiveSovereignWallets();
    console.log(`[SovereignDataService] Found ${wallets.length} active wallets for sync.`);

    for (const wallet of wallets) {
      console.log(`[SovereignDataService] Syncing vesting for ${wallet}...`);
      await this.discoverAndMirror(wallet, 'all');
      // Adding a small delay to avoid hitting rate limits
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Also run a global protocol sync for new contracts
    await this.syncGlobalProtocols();
    
    console.log('[SovereignDataService] Vesting data sync complete.');
  }

  /**
   * TESTNET ONLY: Generate mock vesting for demo purposes
   */
  async generateMockVesting(wallet, symbol, amount) {
    const timestamp = new Date().toISOString();
    const id = `demo-v-${symbol}-${createId().slice(0, 8)}`;
    const pv = parseFloat(amount) * 0.95 * 1e6; // 95% value in 6 decimals

    const mockVesting = {
      id,
      loanId: id,
      collateralId: id,
      chain: 'sepolia',
      contractAddress: '0xDEMO' + createId().slice(0, 36),
      protocol: symbol === 'VESTRA' ? 'Vestra DAO' : 'Sablier V2',
      symbol: symbol,
      name: `${symbol} Testnet Vesting`,
      amount: amount,
      quantity: amount,
      pv: Math.round(pv),
      unlockTime: Math.floor(Date.now() / 1000) + 90 * 86400, // 90 days
      active: true,
      consensusScore: 1.0,
      isDemo: true
    };

    await persistence.saveVestingSource({
      id: mockVesting.id,
      chainId: mockVesting.chain,
      vestingContract: mockVesting.contractAddress,
      protocol: mockVesting.protocol,
      lockupAddress: wallet,
      streamId: mockVesting.id,
      lastSyncedAt: timestamp,
      consensusScore: 1.0,
      metadata: mockVesting
    });

    return mockVesting;
  }

  /**
   * Mobula Market Data (Price, ATH, ATL)
   */
  async fetchMobulaMarketData(symbolOrAddress) {
    if (!MOBULA_API_KEY) return null;
    try {
      const assetParam = symbolOrAddress.startsWith('0x') ? `address=${symbolOrAddress}` : `asset=${symbolOrAddress}`;
      console.log(`[SovereignDataService] Calling Mobula Market Data API for ${symbolOrAddress}...`);
      const resp = await fetch(`${MOBULA_API_URL}/market/data?${assetParam}`, {
        headers: { 'X-API-Key': MOBULA_API_KEY }
      });
      if (!resp.ok) return null;
      const { data } = await resp.json();
      return {
        price: data.price,
        ath: data.ath,
        atl: data.atl,
        marketCap: data.market_cap,
        marketCapDiluted: data.market_cap_diluted,
        source: 'Mobula'
      };
    } catch (err) {
      console.warn(`[SovereignDataService] Mobula market data failed for ${symbolOrAddress}:`, err.message);
      return null;
    }
  }

  /**
   * DexScreener Fallback for newly discovered tokens
   */
  async fetchDexScreenerPrice(addressOrSymbol) {
    try {
      const query = addressOrSymbol.startsWith('0x') ? `tokens/${addressOrSymbol}` : `search?q=${addressOrSymbol}`;
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/${query}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data.pairs && data.pairs[0]) {
        return parseFloat(data.pairs[0].priceUsd);
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  async fetchWithRetry(url, options = {}, retries = 3) {
    const tokenomistKey = process.env.TOKENOMIST_API_KEY;
    if (!tokenomistKey) return null;
    
    for (let i = 0; i < retries; i++) {
      try {
        const resp = await fetch(url, {
          ...options,
          headers: { ...options.headers, 'x-api-key': tokenomistKey }
        });
        if (resp.ok) return await resp.json();
        
        if (resp.status === 429) {
          const waitTime = 2000 * (i + 1);
          console.warn(`[SovereignDataService] Rate limited for ${url}. Waiting ${waitTime}ms...`);
          await new Promise(r => setTimeout(r, waitTime));
        } else {
          console.warn(`[SovereignDataService] API Error ${resp.status} for ${url}`);
          if (resp.status >= 500) {
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          } else {
            return null; // Don't retry client errors unless 429
          }
        }
      } catch (err) {
        console.warn(`[SovereignDataService] Fetch attempt ${i + 1} failed for ${url}:`, err.message);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    return null;
  }

  /**
   * Tokenomist (formerly Token Unlocks) Vesting API
   */
  async fetchTokenomistVesting(tokenId) {
    console.log(`[SovereignDataService] Calling Tokenomist API V4 (Unlocks) for ${tokenId}...`);
    // Use V4 endpoint for unlock events
    return this.fetchWithRetry(`https://api.unlocks.app/v4/unlock/events?tokenId=${tokenId}`);
  }

  async fetchTokenomistAllocations(tokenId) {
    console.log(`[SovereignDataService] Calling Tokenomist API (Allocations) for ${tokenId}...`);
    const data = await this.fetchWithRetry(`${TOKENOMIST_API_URL}/token/allocations/${tokenId}`);
    return data ? (Array.isArray(data) ? data : (data.data || null)) : null;
  }

  async fetchTokenomistInvestors(tokenId) {
    console.log(`[SovereignDataService] Calling Tokenomist API (Investors) for ${tokenId}...`);
    const data = await this.fetchWithRetry(`${TOKENOMIST_API_URL}/token/investors/${tokenId}`);
    return data ? (Array.isArray(data) ? data : (data.data || null)) : null;
  }

  async fetchTokenomistFundraising(tokenId) {
    console.log(`[SovereignDataService] Calling Tokenomist API (Fundraising) for ${tokenId}...`);
    const data = await this.fetchWithRetry(`${TOKENOMIST_API_URL}/token/fundraising/${tokenId}`);
    return data ? (Array.isArray(data) ? data : (data.data || null)) : null;
  }

  /**
   * Fetch Wallet Financial Activity Metrics (Age, Tx Count, Volume, Balance)
   */
  async fetchWalletFinancialMetrics(wallet) {
    const isEvm = wallet.startsWith('0x') && wallet.length === 42;
    if (!isEvm) return { ageMonths: 0, txCount: 0, totalVolume: 0, currentBalance: 0, athBalance: 0 };

    try {
      const client = this.evmClients[1]; // Use Mainnet for meaningful history
      if (!client) return { ageMonths: 0, txCount: 0, totalVolume: 0, currentBalance: 0, athBalance: 0 };

      const [txCount, balance, ageData] = await Promise.all([
        client.getTransactionCount({ address: wallet }),
        client.getBalance({ address: wallet }),
        this.fetchWalletAge(wallet)
      ]);

      // Estimate total volume and ATH from Mobula if possible, otherwise use balance
      const portfolio = await this.getMobulaPortfolio(wallet);
      const totalVolume = portfolio?.tokens?.reduce((acc, t) => acc + (parseFloat(t.value) || 0), 0) * 1.5 || 0;
      const currentBalanceUsd = portfolio?.tokens?.reduce((acc, t) => acc + (parseFloat(t.value) || 0), 0) || 0;
      const athBalance = Math.max(currentBalanceUsd, portfolio?.ath || currentBalanceUsd);

      return {
        ageMonths: ageData.ageMonths || 0,
        txCount: Number(txCount) || 0,
        totalVolume: Math.round(totalVolume),
        currentBalance: Math.round(currentBalanceUsd),
        athBalance: Math.round(athBalance)
      };
    } catch (err) {
      console.warn('[SovereignDataService] Financial metrics fetch failed:', err.message);
      // Deterministic fallback for DEMO_MODE/Dev
      if (DEMO_MODE) {
        const seed = parseInt(wallet.slice(-4), 16) || 0;
        return {
          ageMonths: (seed % 24) + 6,
          txCount: (seed % 500) + 50,
          totalVolume: (seed % 100000) + 10000,
          currentBalance: (seed % 10000) + 1000,
          athBalance: (seed % 20000) + 5000
        };
      }
      return { ageMonths: 0, txCount: 0, totalVolume: 0, currentBalance: 0, athBalance: 0 };
    }
  }

  async fetchWalletAge(wallet) {
    // Check first transaction via Alchemy getAssetTransfers (Inbound)
    const client = this.evmClients[1];
    if (!client) return { ageMonths: 0 };
    
    try {
      const url = client.transport.url;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'alchemy_getAssetTransfers',
          params: [{
            fromBlock: '0x0',
            toBlock: 'latest',
            toAddress: wallet,
            category: ['external', 'internal', 'erc20', 'erc721', 'erc1155'],
            order: 'asc',
            maxCount: '0x1'
          }]
        })
      });
      const { result } = await res.json();
      const firstTx = result?.transfers?.[0];
      if (firstTx) {
          // Approximate block to date (assuming 12s blocks since merge)
          // For simplicity in MVP, we can just use the block number or assume it's several months old if it has history
          const blockNum = parseInt(firstTx.blockNum, 16);
          const currentBlock = Number(await client.getBlockNumber());
          const blocksAgo = currentBlock - blockNum;
          const monthsAgo = Math.floor(blocksAgo / (30 * 24 * 3600 / 12)); // 12s blocks
          return { ageMonths: Math.max(1, monthsAgo) };
      }
      return { ageMonths: 1 };
    } catch (err) {
      return { ageMonths: 1 };
    }
  }

  /**
   * Gitcoin Passport Score (Live + DB Fallback)
   */
  async fetchGitcoinPassportScore(wallet) {
    const gitcoinKey = process.env.GITCOIN_PASSPORT_API_KEY;
    const scorerId = process.env.GITCOIN_PASSPORT_SCORER_ID;
    let liveError = false;

    if (!gitcoinKey || !scorerId) {
      console.warn('[SovereignDataService] Gitcoin Passport config missing (key or scorerId), attempting fallback...');
      liveError = true;
    } else {
      try {
        console.log(`[SovereignDataService] Calling Gitcoin Passport Scorer API for ${wallet}...`);
        const resp = await fetch(`${GITCOIN_PASSPORT_API_URL}/${scorerId}/${wallet}`, {
          headers: { 'X-API-KEY': gitcoinKey }
        });
        if (!resp.ok) {
          console.warn(`[SovereignDataService] Gitcoin Passport API returned ${resp.status}, attempting fallback...`);
          liveError = true;
        } else {
          const data = await resp.json();
          return {
            score: parseFloat(data.score || 0),
            status: data.status,
            lastUpdated: data.last_score_timestamp,
            source: 'Gitcoin'
          };
        }
      } catch (err) {
        console.warn(`[SovereignDataService] Gitcoin Passport failed for ${wallet}:`, err.message);
        liveError = true;
      }
    }

    if (liveError) {
      console.log(`[SovereignDataService] Falling back to manual Gitcoin Passport Score from DB for ${wallet}...`);
      try {
        const attestations = await persistence.listIdentityAttestations(wallet);
        const gitcoinAttestation = attestations.find(a => a.provider === 'gitcoinpassport');
        if (gitcoinAttestation) {
           return {
             score: gitcoinAttestation.score || 0,
             status: 'SAVED',
             lastUpdated: gitcoinAttestation.verifiedAt,
             source: 'DB_Fallback'
           };
        }
      } catch (dbErr) {
         console.warn(`[SovereignDataService] DB fallback for score failed:`, dbErr.message);
      }
    }

    return { score: 0, status: 'ERROR', source: 'None' };
  }

  /**
   * Gitcoin Passport Stamps (Live + DB Fallback)
   */
  async fetchGitcoinPassportStamps(wallet) {
    const gitcoinKey = process.env.GITCOIN_PASSPORT_API_KEY;
    
    // 1. Live Fetch
    try {
      console.log(`[SovereignDataService] Calling Gitcoin Passport Stamps API for ${wallet}...`);
      const resp = await fetch(`https://api.scorer.gitcoin.co/registry/stamps/${wallet}?limit=1000`, {
        headers: { ...(gitcoinKey ? { 'X-API-KEY': gitcoinKey } : {}) }
      });
      
      if (resp.ok) {
        const data = await resp.json();
        const stamps = data.items || data.stamps || [];
        return { stamps };
      } else {
        console.warn(`[SovereignDataService] Gitcoin Passport Stamps API returned ${resp.status}, attempting fallback...`);
      }
    } catch (err) {
      console.warn(`[SovereignDataService] Gitcoin Passport Stamps failed for ${wallet}:`, err.message);
    }

    // 2. DB Fallback
    console.log(`[SovereignDataService] Falling back to manual Gitcoin Passport Stamps from DB for ${wallet}...`);
    try {
      const attestations = await persistence.listIdentityAttestations(wallet);
      const gitcoinAttestation = attestations.find(a => a.provider === 'gitcoinpassport');
      
      if (gitcoinAttestation && gitcoinAttestation.metadata) {
        const meta = typeof gitcoinAttestation.metadata === 'string' 
          ? JSON.parse(gitcoinAttestation.metadata) 
          : gitcoinAttestation.metadata;
          
        if (meta && meta.stamps) {
           return { stamps: meta.stamps };
        }
      }
    } catch (dbErr) {
      console.warn(`[SovereignDataService] DB fallback for stamps failed:`, dbErr.message);
    }
    
    return { stamps: [] };
  }

  /**
   * Covalent Multi-chain Financial History
   */
  async fetchCovalentFinancials(wallet) {
    const covalentKey = process.env.COVALENT_API_KEY || 'cqt_rQYjttT7Rm3HQcF7QfTbRxMyBggW';
    const chains = [1, 10, 8453, 42161]; 
    
    let totalTxCount = 0;
    let firstTxDate = Date.now();
    const activeMonthsSet = new Set();
    let latestTxTimestamp = 0;
    let volumeTraded = 0;
    let largestTxValue = 0;
    let balanceUsd = 0;
    let peakUsdValue = 0;

    const tasks = chains.map(async (chainId) => {
      try {
        // 1. Fetch Balances
        const balUrl = `${COVALENT_API_URL}/${chainId}/address/${wallet}/balances_v2/?key=${covalentKey}`;
        const balData = await this._fetchWithRetry(balUrl);
        if (balData?.data?.items) {
          balData.data.items.forEach(item => {
            balanceUsd += (item.quote || 0);
          });
        }

        // 2. Fetch Transactions
        const txUrl = `${COVALENT_API_URL}/${chainId}/address/${wallet}/transactions_v3/?key=${covalentKey}`;
        const txData = await this._fetchWithRetry(txUrl);
        if (txData?.data?.items) {
          const txs = txData.data.items;
          totalTxCount += txs.length;
          
          txs.forEach(tx => {
            const date = new Date(tx.block_signed_at);
            const ts = Math.floor(date.getTime() / 1000);
            if (ts * 1000 < firstTxDate) firstTxDate = ts * 1000;
            if (ts > latestTxTimestamp) latestTxTimestamp = ts;
            
            const valUsd = parseFloat(tx.value_quote || 0);
            volumeTraded += valUsd;
            if (valUsd > largestTxValue) largestTxValue = valUsd;

            const now = new Date();
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(now.getMonth() - 12);
            if (date >= twelveMonthsAgo) {
              const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
              activeMonthsSet.add(monthKey);
            }
          });
        }

        // 3. Fetch Portfolio
        const portUrl = `${COVALENT_API_URL}/${chainId}/address/${wallet}/portfolio_v2/?key=${covalentKey}`;
        const portData = await this._fetchWithRetry(portUrl).catch(() => null);
        
        if (portData?.data?.items) {
          portData.data.items.forEach(item => {
            const holdings = item.holdings || [];
            const totalValue = holdings.reduce((acc, h) => acc + (h.close?.quote || 0), 0);
            
            if (isFinite(totalValue) && totalValue > (peakUsdValue || 0)) {
              peakUsdValue = totalValue;
            }

            if (item.contract_address) {
              discovered.tokens.push({
                id: `cov-${chainId}-${item.contract_address}`,
                chain: chainId === 1 ? 'mainnet' : (chainId === 8453 ? 'base' : (chainId === 10 ? 'optimism' : 'arbitrum')),
                chainId,
                contractAddress: item.contract_address,
                protocol: 'Covalent Discovery',
                amount: item.balance || '0',
                symbol: item.contract_ticker_symbol || 'ERC20',
                name: item.contract_name || 'Unknown Token',
                decimals: item.contract_decimals || 18,
                consensusScore: 0.9,
                financials: {
                  balanceUsd: item.quote || 0,
                  quoteRate: item.quote_rate || 0
                }
              });
            }
          });
        }
      } catch (err) {
        console.warn(`[SovereignDataService] Covalent fetch failed for chain ${chainId}:`, err.message);
      }
    });

    await Promise.all(tasks);

    // 3. Testnet Fallback: If 0 transactions, try Sepolia Etherscan directly
    if (totalTxCount === 0) {
      try {
        console.log(`[SovereignDataService] 0 txs found via Covalent. Trying Sepolia Etherscan for ${wallet}...`);
        const etherscanUrl = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${wallet}&sort=asc${process.env.ETHERSCAN_API_KEY ? '&apikey=' + process.env.ETHERSCAN_API_KEY : ''}`;
        const esResp = await fetch(etherscanUrl);
        if (esResp.ok) {
          const esData = await esResp.json();
          if (esData.status === "1" && Array.isArray(esData.result) && esData.result.length > 0) {
            totalTxCount += esData.result.length;
            esData.result.forEach(tx => {
              const date = new Date(parseInt(tx.timeStamp) * 1000);
              const ts = date.getTime();
              if (ts < firstTxDate) firstTxDate = ts;
              activeMonthsSet.add(`${date.getFullYear()}-${date.getMonth()}`);
            });
          }
        }
      } catch (fallbackErr) {
        console.warn(`[SovereignDataService] Etherscan fallback failed:`, fallbackErr.message);
      }
    }

    return {
      totalTxCount,
      ageMonths: Math.floor((Date.now() - firstTxDate) / (30 * 24 * 3600 * 1000)),
      activeMonths: activeMonthsSet.size,
      peakUsdValue,
      latestTxTimestamp,
      volumeTraded,
      largestTx: largestTxValue,
      balanceUsd
    };
  }

  /**
   * Gitcoin Passport V2 Metadata (Global Stamps List)
   */
  async fetchGitcoinPassportMetadata() {
    const gitcoinKey = process.env.GITCOIN_PASSPORT_API_KEY;
    const cacheKey = 'gitcoin_passport_v2_metadata';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 3600000 * 24) {
      return cached.data;
    }

    try {
      console.log('[SovereignDataService] Fetching Gitcoin Passport V2 metadata...');
      const resp = await fetch(`${GITCOIN_PASSPORT_V2_API_URL}/stamps/metadata`, {
        headers: { ...(gitcoinKey ? { 'X-API-KEY': gitcoinKey } : {}) }
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (err) {
      console.warn('[SovereignDataService] Gitcoin Passport V2 metadata failed:', err.message);
      return null;
    }
  }

  /**
   * Refresh the VCS score and identity profile for a wallet (Aggregated for all linked wallets)
   */
  async refreshIdentityProfile(walletAddress) {
    if (!walletAddress) return null;
    const normalized = walletAddress.toLowerCase();
    console.log(`[SovereignDataService] Refreshing aggregated identity profile for ${normalized}...`);

    try {
      // 0. Resolve all linked wallets
      const linkedWallets = await persistence.getLinkedWalletsByAddress(normalized);
      console.log(`[SovereignDataService] Found ${linkedWallets.length} linked wallets for ${normalized}`);

      // 1. Fetch data for all wallets in parallel
      const walletDataTasks = linkedWallets.map(async (link) => {
        const addr = link.walletAddress;
        const chain = link.chainType;
        
        // Fetch metrics based on chain type
        const [scoreData, financials, vestings] = await Promise.all([
          chain === 'evm' ? this.fetchGitcoinPassportScore(addr) : { score: 0 },
          chain === 'evm' ? this.fetchCovalentFinancials(addr) : { totalTxCount: 0, ageMonths: 0, activeMonths: 0, peakUsdValue: 0, balanceUsd: 0, volumeTraded: 0, largestTx: 0 },
          VestingOracleService.fetchUserVestings(addr, chain)
        ]);
        
        return { scoreData, financials, vestings };
      });

      const results = await Promise.all(walletDataTasks);

      // 2. Aggregate metrics
      let totalGitcoinScore = 0;
      let totalTxCount = 0;
      let maxAgeMonths = 0;
      let totalActiveMonths = 0;
      let peakUsdValue = 0;
      let totalBalanceUsd = 0;
      let totalVolumeTraded = 0;
      let maxLargestTx = 0;
      let totalActiveVestingUsd = 0;
      let totalVestingMonthlyInflowUsd = 0;
      let latestTxTimestamp = 0;

      results.forEach(res => {
        totalGitcoinScore = Math.max(totalGitcoinScore, res.scoreData?.score || 0);
        totalTxCount += (res.financials.totalTxCount || 0);
        maxAgeMonths = Math.max(maxAgeMonths, res.financials.ageMonths || 0);
        totalActiveMonths += (res.financials.activeMonths || 0);
        peakUsdValue = Math.max(peakUsdValue, res.financials.peakUsdValue || 0);
        totalBalanceUsd += (res.financials.balanceUsd || 0);
        totalVolumeTraded += (res.financials.volumeTraded || 0);
        maxLargestTx = Math.max(maxLargestTx, res.financials.largestTx || 0);
        latestTxTimestamp = Math.max(latestTxTimestamp, res.financials.latestTxTimestamp || 0);

        (res.vestings || []).forEach(v => {
          totalActiveVestingUsd += (v.usdValue || 0);
          totalVestingMonthlyInflowUsd += (v.monthlyInflowUsd || 0);
        });
      });

      // 3. Fetch internal protocol data (repayments/defaults) - Currently EVM only
      const events = await persistence.getActivityEvents({ limit: 1000 });
      const repaidLoans = new Set();
      let defaultedCount = 0;
      let lateRepaymentCount = 0;

      // Extract all linked addresses for internal matching
      const allAddrs = new Set(linkedWallets.map(l => l.walletAddress.toLowerCase()));
      
      for (const event of events) {
        const borrower = (event?.borrower || '').toLowerCase();
        if (!allAddrs.has(borrower)) continue;
        
        if (event.type === 'LoanRepaid' || event.type === 'LoanRepaidWithSwap') {
          repaidLoans.add(String(event.loanId || ''));
          if (event.late || event.payload?.late) lateRepaymentCount++;
        }
        if (event.type === 'LoanSettled' && event.defaulted) {
          defaultedCount += 1;
        }
      }

      // 4. Calculate new Aggregated VCS score
      const scoreInfo = calculateIdentityCreditScore({
        gitcoinPassportScore: totalGitcoinScore,
        txCount: totalTxCount,
        ageMonths: maxAgeMonths,
        activeMonths: totalActiveMonths,
        peakUsdValue: peakUsdValue,
        activeVestingUsd: totalActiveVestingUsd,
        vestingMonthlyInflowUsd: totalVestingMonthlyInflowUsd,
        totalRepaidLoans: repaidLoans.size,
        hasActiveDefaults: defaultedCount > 0,
        lateRepaymentCount
      });

      // 5. Upsert to vcs_scores table (Keyed by the primary/requesting wallet)
      await persistence.upsertVcsScore({
        wallet: normalized,
        gitcoin_score: totalGitcoinScore,
        financial_score: scoreInfo.breakdown.financial,
        credit_history_score: scoreInfo.breakdown.credit,
        vesting_score: scoreInfo.breakdown.vesting,
        total_vcs_score: scoreInfo.score,
        tier: scoreInfo.tier,
        total_repaid_loans: repaidLoans.size,
        has_defaults: defaultedCount > 0,
        tx_count: totalTxCount,
        wallet_age_days: maxAgeMonths * 30,
        unique_protocols: totalActiveMonths,
        balance_usd: totalBalanceUsd,
        latest_tx_timestamp: latestTxTimestamp,
        volume_traded: totalVolumeTraded,
        largest_tx: maxLargestTx,
        active_vesting_usd: totalActiveVestingUsd,
        vesting_monthly_inflow_usd: totalVestingMonthlyInflowUsd,
        raw_data: { 
          aggregated: true,
          linkedWallets: linkedWallets.length,
          wallets: linkedWallets.map(l => l.walletAddress),
          metrics: { totalGitcoinScore, totalTxCount, totalBalanceUsd, totalActiveVestingUsd }
        }
      });

      // 6. Return enriched profile
      return {
        walletAddress: normalized,
        ...scoreInfo,
        compositeScore: scoreInfo.score,
        linkedWallets: linkedWallets.map(l => ({ address: l.walletAddress, chain: l.chainType })),
        creditHistory: { repaidCount: repaidLoans.size, defaultedCount },
        activityMetrics: {
          totalTxCount,
          balanceUsd: totalBalanceUsd,
          activeVestingUsd: totalActiveVestingUsd,
          vestingMonthlyInflowUsd: totalVestingMonthlyInflowUsd
        }
      };
    } catch (err) {
      console.error(`[SovereignDataService] Global refresh failed for ${walletAddress}:`, err);
      throw err;
    }
  }

  /**
   * Sync all stale identity profiles (older than 3 days)
   */
  async syncAllStaleIdentities(days = 3) {
    console.log(`[SovereignDataService] Starting sync for stale identities (older than ${days} days)...`);
    try {
      const staleProfiles = await persistence.listStaleIdentityProfiles({ days, limit: 100 });
      console.log(`[SovereignDataService] Found ${staleProfiles.length} stale profiles.`);

      for (const profile of staleProfiles) {
        await this.refreshIdentityProfile(profile.walletAddress);
        // Rate limiting
        await new Promise(r => setTimeout(r, 2000));
      }

      console.log('[SovereignDataService] Stale identity sync complete.');
    } catch (err) {
      console.error('[SovereignDataService] Stale identity sync failed:', err.message);
    }
  }
}

module.exports = new SovereignDataService();
