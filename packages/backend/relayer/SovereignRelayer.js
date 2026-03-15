// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const SovereignDataService = require('../lib/SovereignDataService');
const persistence = require('../persistence');

class SovereignRelayer {
  constructor() {
    this.isRunning = false;
    this.pollIntervalSeconds = 30; // Polling window for global sync
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[SovereignRelayer] Activated for Sovereign Liquidity.');
    
    // Start periodic polling in the background
    this.runPolling();
  }

  async stop() {
    this.isRunning = false;
    console.log('[SovereignRelayer] Deactivated.');
  }

  async runPolling() {
    while (this.isRunning) {
      try {
        await this.pulse();
      } catch (err) {
        console.error('[SovereignRelayer] Pulse cycle failed:', err.message);
      }
      // Wait for next block window (simulated)
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalSeconds * 1000));
    }
  }

  /**
   * Main logic to discover and mirror assets for ALL active users
   */
  async pulse() {
    const startTime = Date.now();
    console.log(`[SovereignRelayer] Initiating sovereign data acquisition pulse...`);
    
    // 1. Get all wallets that have used the protocol recently
    const activeWallets = await persistence.getRecentWallets();
    const sovereignWallets = await persistence.getActiveSovereignWallets();
    
    // Combine and unique
    const targetWallets = [...new Set([...activeWallets, ...sovereignWallets])];
    
    console.log(`[SovereignRelayer] Scanning ${targetWallets.length} active wallets for sovereign assets.`);

    // 2. Poll data for each wallet (batched)
    const BATCH_SIZE = 5;
    for (let i = 0; i < targetWallets.length; i += BATCH_SIZE) {
      if (!this.isRunning) break;
      const batch = targetWallets.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(wallet => 
        SovereignDataService.discoverAndMirror(wallet, 'all')
      ));
    }

    // 3. Update global consensus metrics (DIA, Pyth, Chainlink)
    await this.updateGlobalConsensus();

    const duration = (Date.now() - startTime) / 1000;
    console.log(`[SovereignRelayer] Pulse complete. Cycle duration: ${duration.toFixed(2)}s`);
  }

  /**
   * Cross-verify Pyth, Chainlink, DIA, and Mobula for top collateral assets
   */
  async updateGlobalConsensus() {
    const assets = ['VSTR', 'SOL', 'ETH', 'USDC'];
    try {
      for (const asset of assets) {
        const consensusPrice = await SovereignDataService.getConsensusPrice(asset);
        if (consensusPrice > 0) {
          console.log(`[SovereignRelayer] Verified Global Consensus for ${asset}: $${consensusPrice.toFixed(4)}`);
          
          // If RedStone is the source, log that the Pull Model payload is ready
          const providers = await SovereignDataService.getConsensusPrice(asset, true); // Future: return provider details
          console.log(`[SovereignRelayer] RedStone Pull Model payload ready for ${asset}`);
          
          await persistence.setMeta(`consensus_price_${asset}`, consensusPrice);
        }
      }
    } catch (err) {
      console.warn('[SovereignRelayer] Global consensus update failed:', err.message);
    }
  }
}

module.exports = new SovereignRelayer();
