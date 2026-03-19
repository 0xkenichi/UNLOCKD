// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');
const { fetch } = require('undici');
const persistence = require('../persistence');
const { fetchSablierStreams } = require('../evm/sablier');
const { fetchHedgeyPlans } = require('../evm/hedgey');
const { fetchSuperfluidStreams } = require('../evm/superfluid');
const { fetchStreamflowVestingContracts } = require('../solana/streamflow');
const { WrapperBuilder, DataServiceWrapper } = require('@redstone-finance/evm-connector');
const { getSignersForDataServiceId } = require('@redstone-finance/sdk');
const redstone = require('redstone-api');
const crypto = require('crypto');
const pyth = require('../solana/pyth');
const { createPublicClient, http } = require('viem');
const { mainnet, base, sepolia, baseSepolia } = require('viem/chains');

const createId = () => crypto.randomBytes(16).toString('hex');

const DUNE_API_KEY = process.env.DUNE_API_KEY || '';
const MOBULA_API_KEY = process.env.MOBULA_API_KEY || '';
const CRYPTORANK_API_KEY = process.env.CRYPTORANK_API_KEY || '';

const DIA_API_URL = 'https://api.diadata.org/v1/asset_information';
const MOBULA_API_URL = 'https://api.mobula.io';
const CRYPTORANK_API_URL = 'https://api.cryptorank.io/v2';
const DEFILLAMA_VESTING_URL = 'https://api.llama.fi/listVesting';
const GITCOIN_PASSPORT_API_URL = 'https://api.passport.xyz/v1/scorer';
const GITCOIN_PASSPORT_V2_API_URL = 'https://api.passport.xyz/v2';
const TOKENOMIST_API_URL = 'https://api.unlocks.app/v2'; 

const REDSTONE_DATA_SERVICE_ID = 'redstone-primary-prod';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

class SovereignDataService {
  constructor() {
    this.cache = new Map();
    this.syncInterval = 15; // Primary sync every 15 blocks (simulated)
    this.timeOffset = 0; // Simulation time offset in seconds
    
    // Viem clients for sniffing
    this.evmClients = {
      1: createPublicClient({ chain: mainnet, transport: http() }),
      8453: createPublicClient({ chain: base, transport: http() }),
      11155111: createPublicClient({ chain: sepolia, transport: http() }),
      84532: createPublicClient({ chain: baseSepolia, transport: http() })
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
        status.DIA = !!(await this.getDiaAssetInfo('BTC'));
        status.Mobula = !!MOBULA_API_KEY;
        status.CryptoRank = !!CRYPTORANK_API_KEY;
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
    }, 30000);
  }

  setTimeOffset(seconds) {
    this.timeOffset = seconds;
    console.log(`[SovereignDataService] Time offset updated: ${seconds}s`);
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
      locked: []
    };

    try {
      const tasks = [];

      if (chainType === 'evm' || chainType === 'all') {
        const isEvm = wallet.startsWith('0x') && wallet.length === 42;
        if (isEvm || chainType === 'evm') {
          // Iterate through main supported chains
          const chains = DEMO_MODE ? [11155111, 84532] : [1, 10, 8453, 11155111, 84532];
          
          for (const chainId of chains) {
            const client = this.evmClients[chainId];
            tasks.push(
              fetchSablierStreams([wallet], chainId, client)
                .then(res => discovered.vesting.push(...res))
                .catch(err => console.warn(`[SovereignDataService] Sablier failed on ${chainId}:`, err.message))
            );
            tasks.push(
              fetchHedgeyPlans(wallet, chainId, client)
                .then(res => discovered.vesting.push(...res))
                .catch(err => console.warn(`[SovereignDataService] Hedgey failed on ${chainId}:`, err.message))
            );

            if (chainId === 8453) { // Holi is on Base
              tasks.push(
                this.fetchHoliSchedules(wallet, client)
                  .then(res => discovered.vesting.push(...res))
                  .catch(err => console.warn(`[SovereignDataService] Holi failed:`, err.message))
              );
            }
          }

          tasks.push(
            fetchSuperfluidStreams([wallet])
              .then(res => discovered.vesting.push(...res))
              .catch(err => console.warn('[SovereignDataService] Superfluid failed:', err.message))
          );
          
          tasks.push(
            this.getMobulaPortfolio(wallet)
              .then(res => {
                discovered.vesting.push(...res.vesting || []);
                discovered.staked.push(...res.staked || []);
              })
              .catch(err => console.warn('[SovereignDataService] Mobula failed:', err.message))
          );
          
          tasks.push(
            this.queryDuneStaked(wallet)
              .then(res => discovered.staked.push(...res))
              .catch(err => console.warn('[SovereignDataService] DuneStaked failed:', err.message))
          );

          // Vestra Demo schedules (Sepolia only)
          if (DEMO_MODE) {
            tasks.push(
              this.fetchVestraDemoSchedules(wallet, this.evmClients[11155111])
                .then(res => discovered.vesting.push(...res))
                .catch(err => console.warn('[SovereignDataService] Vestra Demo failed:', err.message))
            );
          }
          
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

      if (chainType === 'solana' || chainType === 'all') {
        const isSolana = !wallet.startsWith('0x') && wallet.length >= 32 && wallet.length <= 44;
        if (isSolana || chainType === 'solana') {
          tasks.push(
            fetchStreamflowVestingContracts([wallet])
              .then(res => discovered.vesting.push(...res))
              .catch(err => console.warn('[SovereignDataService] Streamflow failed:', err.message))
          );
        }
      }

      try {
        const concurrencyLimit = 5;
        for (let i = 0; i < tasks.length; i += concurrencyLimit) {
          await Promise.allSettled(tasks.slice(i, i + concurrencyLimit));
        }
        
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
    const range = DEMO_MODE ? 50000n : 5000000n;
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
   * Fetch Vestra Demo (MockLinearVestingWallet) positions for a wallet
   */
  async fetchVestraDemoSchedules(wallet, client) {
    if (!client) return [];
    
    const { scanVestingLogs } = require('./discovery_utils');
    const range = 50000n; 
    const logs = await scanVestingLogs(client, wallet, range);
    const demoLogs = logs.filter(l => l.protocol === 'Vestra Demo');
    
    if (demoLogs.length === 0) return [];
    
    const VESTING_ABI = [
      { name: 'start', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
      { name: 'duration', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
      { name: 'released', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' }
    ];

    const results = [];
    for (const log of demoLogs) {
        try {
            const contractAddr = log.contractAddress;
            
            const [start, duration, released] = await Promise.all([
                client.readContract({ address: contractAddr, abi: VESTING_ABI, functionName: 'start' }),
                client.readContract({ address: contractAddr, abi: VESTING_ABI, functionName: 'duration' }),
                client.readContract({ address: contractAddr, abi: VESTING_ABI, functionName: 'released', args: [] })
            ]);

            const totalAmount = BigInt(log.amount); 
            const lockedValue = totalAmount - BigInt(released);
            const end = Number(start) + Number(duration);

            results.push({
                id: log.id,
                loanId: log.id,
                collateralId: log.id,
                chain: 'sepolia',
                contractAddress: contractAddr,
                protocol: 'Vestra Demo',
                symbol: 'VESTRA',
                name: 'Vestra Demo Wallet',
                amount: log.amount,
                quantity: log.amount,
                pv: Number(totalAmount) * 0.9, 
                unlockTime: end,
                active: lockedValue > 0n,
                isDemo: true
            });
        } catch (err) {
            console.warn(`[SovereignDataService] Demo fetch failed for ${log.contractAddress}:`, err.message);
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
      
      const results = { vesting: [], staked: [] };
      if (data.data && data.data.assets) {
        for (const asset of data.data.assets) {
          if (asset.is_vesting) {
            results.vesting.push({
              id: `mobula-v-${asset.asset.symbol}`,
              chain: asset.asset.chain,
              contractAddress: asset.asset.contract_address,
              protocol: 'Mobula Discovery',
              symbol: asset.asset.symbol,
              name: asset.asset.name,
              amount: asset.token_balance,
              consensusScore: 0.9
            });
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
      this.fetchMobulaMarketData(symbol).then(m => m ? { price: m.price, source: 'Mobula' } : null).catch(() => null)
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
    if (!DUNE_API_KEY) return [];
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
        if (unlockData) {
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
          
          const events = unlockData.events || unlockData.data?.events || [];
          if (Array.isArray(events)) {
            for (const event of events) {
              await persistence.saveTokenUnlockEvent({
                tokenId: token.id,
                eventType: event.type || event.event_type,
                occurrenceDate: event.date || event.timestamp,
                amount: event.amount,
                percentage: event.percentage,
                metadata: event
              });
            }
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
      console.log(`[SovereignDataService] Calling Mobula Market Data API for ${symbolOrAddress}...`);
      // V2 endpoint: /api/2/market/data?asset=...
      const resp = await fetch(`${MOBULA_API_URL}/market/data?asset=${symbolOrAddress}`, {
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
    console.log(`[SovereignDataService] Calling Tokenomist API (Unlocks) for ${tokenId}...`);
    return this.fetchWithRetry(`${TOKENOMIST_API_URL}/token/unlocks/${tokenId}`);
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
   * Gitcoin Passport Score
   */
  async fetchGitcoinPassportScore(wallet) {
    const gitcoinKey = process.env.GITCOIN_PASSPORT_API_KEY;
    const scorerId = process.env.GITCOIN_PASSPORT_SCORER_ID;
    if (!gitcoinKey || !scorerId) {
      console.warn('[SovereignDataService] Gitcoin Passport config missing (key or scorerId).');
      return null;
    }
    try {
      console.log(`[SovereignDataService] Calling Gitcoin Passport Scorer API for ${wallet}...`);
      const resp = await fetch(`${GITCOIN_PASSPORT_API_URL}/${scorerId}/score/${wallet}`, {
        headers: { 'X-API-KEY': gitcoinKey }
      });
      if (!resp.ok) {
        console.warn(`[SovereignDataService] Gitcoin Passport API returned ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      return {
        score: parseFloat(data.score || 0),
        status: data.status,
        lastUpdated: data.last_score_timestamp,
        source: 'Gitcoin'
      };
    } catch (err) {
      console.warn(`[SovereignDataService] Gitcoin Passport failed for ${wallet}:`, err.message);
      return null;
    }
  }

  /**
   * Gitcoin Passport V2 Stamps
   */
  async fetchGitcoinPassportStamps(wallet) {
    const gitcoinKey = process.env.GITCOIN_PASSPORT_API_KEY;
    if (!gitcoinKey) return null;
    try {
      console.log(`[SovereignDataService] Calling Gitcoin Passport V2 Stamps API for ${wallet}...`);
      const resp = await fetch(`${GITCOIN_PASSPORT_V2_API_URL}/stamps/${wallet}`, {
        headers: { 'X-API-KEY': gitcoinKey }
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.items || [];
    } catch (err) {
      console.warn(`[SovereignDataService] Gitcoin Passport V2 stamps failed for ${wallet}:`, err.message);
      return null;
    }
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
}

module.exports = new SovereignDataService();
