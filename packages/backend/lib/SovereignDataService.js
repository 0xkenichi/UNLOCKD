// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');
const { fetch } = require('undici');
const persistence = require('../persistence');
const { fetchSablierStreams } = require('../evm/sablier');
const { fetchSuperfluidStreams } = require('../evm/superfluid');
const { fetchStreamflowVestingContracts } = require('../solana/streamflow');

const DUNE_API_KEY = process.env.DUNE_API_KEY || '';
const DIA_API_URL = 'https://api.diadata.org/v1/asset_information';

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
        
        // Staked/Locked discovery via Dune/The Graph (Placeholders for real subgraphs)
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
        id: v.loanId || `v-${v.collateralId}`,
        chainId: v.chain || 'evm',
        vestingContract: v.token || v.collateralId,
        protocol: v.protocol || 'manual',
        lockupAddress: v.borrower || wallet,
        streamId: v.collateralId,
        lastSyncedAt: timestamp,
        consensusScore: 1.0
      });
    }

    // Mirror Staked
    for (const s of data.staked) {
      // Assuming persistence has a saveStakedSource method or similar
      if (persistence.saveStakedSource) {
        await persistence.saveStakedSource({
          id: s.id || `s-${wallet}-${s.protocol}`,
          chainId: s.chain || 'evm',
          stakingContract: s.stakingContract,
          protocol: s.protocol,
          walletAddress: wallet,
          amount: s.amount,
          lastSyncedAt: timestamp,
          consensusScore: 1.0
        });
      }
    }
  }

  /**
   * Query DIA Oracle for detailed asset information
   */
  async getDiaAssetInfo(symbol) {
    try {
      const resp = await fetch(`${DIA_API_URL}/${symbol}`);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      return null;
    }
  }

  /**
   * Mock Dune query for staked assets
   */
  async queryDuneStaked(wallet) {
    if (!DUNE_API_KEY) return [];
    // In production, this would use executeDuneQuery from scanner.js
    return [
      {
        id: `dune-staking-${wallet.slice(0, 6)}`,
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
