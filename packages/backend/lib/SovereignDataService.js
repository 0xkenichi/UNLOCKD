// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');
const { fetch } = require('undici');
const persistence = require('../persistence');
const { fetchSablierStreams } = require('../evm/sablier');
const { fetchSuperfluidStreams } = require('../evm/superfluid');
const { fetchStreamflowVestingContracts } = require('../solana/streamflow');
const { WrapperBuilder } = require('@redstone-finance/evm-connector');
const { DataServiceWrapper } = require('@redstone-finance/sdk');

const DUNE_API_KEY = process.env.DUNE_API_KEY || '';
const MOBULA_API_KEY = process.env.MOBULA_API_KEY || '';
const CRYPTORANK_API_KEY = process.env.CRYPTORANK_API_KEY || '';

const DIA_API_URL = 'https://api.diadata.org/v1/asset_information';
const MOBULA_API_URL = 'https://api.mobula.io/api/v1';
const CRYPTORANK_API_URL = 'https://api.cryptorank.io/v2';
const DEFILLAMA_VESTING_URL = 'https://api.llama.fi/listVesting';

const REDSTONE_DATA_SERVICE_ID = 'redstone-primary-prod';

class SovereignDataService {
  constructor() {
    this.cache = new Map();
    this.syncInterval = 15; // Primary sync every 15 blocks (simulated)
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
      if (chainType === 'evm' || chainType === 'all') {
        const sablier = await fetchSablierStreams([wallet]);
        const superfluid = await fetchSuperfluidStreams([wallet]);
        discovered.vesting.push(...sablier, ...superfluid);
        
        // Mobula Portfolio Discovery (Multi-chain)
        const mobulaAssets = await this.getMobulaPortfolio(wallet);
        discovered.vesting.push(...mobulaAssets.vesting);
        discovered.staked.push(...mobulaAssets.staked);

        // Staked/Locked discovery via Dune/The Graph
        const duneStaked = await this.queryDuneStaked(wallet);
        discovered.staked.push(...duneStaked);
      }

      if (chainType === 'solana' || chainType === 'all') {
        const streamflow = await fetchStreamflowVestingContracts([wallet]);
        discovered.vesting.push(...streamflow);
      }

      // Mirror to local persistence (Supabase/SQLite)
      await this.mirrorToPersistence(wallet, discovered);

      return discovered;
    } catch (err) {
      console.error('[SovereignDataService] Discovery failed:', err.message);
      return discovered;
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
    if (!MOBULA_API_KEY) return null;
    try {
      const resp = await fetch(`${MOBULA_API_URL}/token/vesting?asset=${tokenAddress}`, {
        headers: { 'Authorization': MOBULA_API_KEY }
      });
      if (!resp.ok) return null;
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
    if (!MOBULA_API_KEY) return { vesting: [], staked: [] };
    try {
      const resp = await fetch(`${MOBULA_API_URL}/wallet/portfolio?wallet=${wallet}`, {
        headers: { 'Authorization': MOBULA_API_KEY }
      });
      if (!resp.ok) return { vesting: [], staked: [] };
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
    if (!CRYPTORANK_API_KEY) return null;
    try {
      const listResp = await fetch(`${CRYPTORANK_API_URL}/currencies?symbols=${symbol}`, {
        headers: { 'X-Api-Key': CRYPTORANK_API_KEY }
      });
      if (!listResp.ok) return null;
      const listData = await listResp.json();
      const currencyId = listData.data && listData.data[0] ? listData.data[0].id : null;
      
      if (!currencyId) return null;

      const vestResp = await fetch(`${CRYPTORANK_API_URL}/currencies/${currencyId}/vesting`, {
        headers: { 'X-Api-Key': CRYPTORANK_API_KEY }
      });
      if (!vestResp.ok) return null;
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
    try {
      const resp = await fetch(`${DIA_API_URL}/${symbol}`);
      if (!resp.ok) return null;
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
      this.fetchRedstonePrice(symbol).then(p => p ? { price: p, source: 'RedStone' } : null),
      Promise.resolve({ price: null, source: 'Pyth' }) 
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
  async fetchRedstonePrice(symbol) {
    try {
      const dataServiceWrapper = new DataServiceWrapper({
        dataServiceId: REDSTONE_DATA_SERVICE_ID,
        dataFeeds: [symbol],
      });
      const dataPackages = await dataServiceWrapper.getDataPackages({
        dataServiceId: REDSTONE_DATA_SERVICE_ID,
        dataFeeds: [symbol],
      });
      if (dataPackages && dataPackages[symbol]) {
        return dataPackages[symbol][0].dataPackage.dataPoints[0].value;
      }
      return null;
    } catch (err) {
      console.warn(`[SovereignDataService] RedStone price failed for ${symbol}:`, err.message);
      return null;
    }
  }

  /**
   * RedStone Payload Generator
   * Used for injecting into transactions for VestraOracleConsumer
   */
  async fetchRedstonePayload(symbols = ['VSTR', 'ETH', 'BTC']) {
    try {
      const dataServiceWrapper = new DataServiceWrapper({
        dataServiceId: REDSTONE_DATA_SERVICE_ID,
        dataFeeds: symbols,
      });
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
}

module.exports = new SovereignDataService();
