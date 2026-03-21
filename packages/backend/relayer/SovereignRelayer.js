// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const SovereignDataService = require('../lib/SovereignDataService');
const persistence = require('../persistence');

class SovereignRelayer {
  constructor() {
    this.isRunning = false;
    this.pollIntervalSeconds = 600; // Polling window for global sync (~50-80 blocks)
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
        console.error('[SovereignRelayer] CRITICAL PULSE ERROR:', err.message);
        if (err.message.includes('user_loans')) {
          console.warn('[SovereignRelayer] Table "user_loans" still missing. Please apply migrations/0011_user_loans_and_collateral.sql');
        }
      }
      // Wait for next block window (simulated)
      console.log(`[SovereignRelayer] Waiting ${this.pollIntervalSeconds}s for next pulse...`);
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

    // 2. Global Protocol Sync (Proactive Discovery)
    await SovereignDataService.syncGlobalProtocols();

    // 3. Poll data for each wallet (batched)
    const BATCH_SIZE = 5;
    for (let i = 0; i < targetWallets.length; i += BATCH_SIZE) {
      if (!this.isRunning) break;
      const batch = targetWallets.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(wallet =>
        SovereignDataService.discoverAndMirror(wallet, 'all')
      ));
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`[SovereignRelayer] Pulse complete. Cycle duration: ${duration.toFixed(2)}s`);
  }

  /**
   * Cross-verify Pyth, Chainlink, DIA, and Mobula for top collateral assets
   */
  async updateGlobalConsensus() {
     // Removed as per user request — focusing only on real-time price feeds in SovereignDataService
  }
}

module.exports = new SovereignRelayer();
