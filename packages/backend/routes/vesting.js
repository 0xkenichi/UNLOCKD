// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const express = require('express');
const router = express.Router();
const persistence = require('../persistence');
const SovereignDataService = require('../lib/SovereignDataService');

/**
 * @api {get} /api/vesting/wallet/:address Discover all vesting contracts for a wallet
 * @apiName DiscoverWalletVesting
 * @apiGroup Vesting
 */
router.get('/wallet/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { chain = 'all' } = req.query;

    if (!address) {
      return res.status(400).json({ success: false, error: 'Wallet address required' });
    }

    // Trigger multi-chain discovery
    const discovered = await SovereignDataService.discoverAndMirror(address, chain);

    // Fetch mirrored sources from DB to ensure consistency
    const sources = await persistence.listVestingSources({ limit: 1000 });
    const walletSources = sources.filter(s => 
      String(s.lockupAddress || '').toLowerCase() === address.toLowerCase()
    );

    res.json({
      success: true,
      address,
      count: walletSources.length,
      data: walletSources,
      raw: discovered
    });
  } catch (err) {
    console.error(`[API] /api/vesting/wallet/${req.params.address} error:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to discover vesting contracts'
    });
  }
});

/**
 * @api {get} /api/vesting List all vesting sources
 * @apiName GetVestingSources
 * @apiGroup Vesting
 */
router.get('/', async (req, res) => {
  try {
    const { chainId, protocol, limit } = req.query;
    const sources = await persistence.listVestingSources({
      chainId,
      protocol,
      limit: limit ? parseInt(limit) : 100
    });
    res.json({
      success: true,
      count: sources.length,
      data: sources
    });
  } catch (err) {
    console.error('[API] /api/vesting error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vesting sources'
    });
  }
});

/**
 * @api {get} /api/vesting/feed Get top vesting feed for landing page ticker
 */
router.get('/feed', async (req, res) => {
  console.log(`[vesting] GET /feed requested with limit=${req.query.limit || 10}`);
  try {
    const { limit = 10 } = req.query;
    const feed = await SovereignDataService.getTopVestingFeed(limit);
    res.json({
      success: true,
      data: feed
    });
  } catch (err) {
    console.error('[API] /api/vesting/feed error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vesting feed'
    });
  }
});

/**
 * @api {get} /api/vesting/all Get all vesting projects and unlock events
 */
router.get('/all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const projects = await persistence.listTokenProjects(limit);
    const events = await persistence.listTokenUnlockEvents({ limit });
    
    res.json({
      success: true,
      projects,
      events
    });
  } catch (err) {
    console.error('[API] /api/vesting/all error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch all vesting data: ' + err.message
    });
  }
});

/**
 * @api {get} /api/vesting/valuation/:id Get dDPV valuation and loan terms for a vesting source
 */
router.get('/valuation/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration = 30 * 86400 } = req.query; // Default 30 days

    // 1. Fetch source from DB
    const sources = await persistence.listVestingSources({ limit: 1000 });
    const source = sources.find(s => s.id === id);
    if (!source) return res.status(404).json({ success: false, error: 'Source not found' });

    // 2. Fetch dDPV from Redis or trigger immediate calc
    // In production, we'd check cache. For the demo, we'll call dDPVService.computeDDPV_v2 locally
    // but we need the RiskParamBundle.
    
    // For now, we'll use a simplified version for the UI or try to get from Redis
    const dDPVService = require('../oracles/dDPVService').ddpvService;
    const cacheKey = `ddpv:result:${source.chainId || 1}:${source.vestingContract}`;
    const cached = await dDPVService.redis.get(cacheKey);
    
    if (cached) {
      const data = JSON.parse(cached);
      return res.json({ success: true, valuation: data });
    }

    // Fallback: Trigger update and return "Processing"
    // For the demo/MVP, we'll return a simulated but realistic dDPV if not cached
    const mockValuation = {
      dpvUsdc: (BigInt(source.quantity || 0) * 8n / 10n).toString(), // 80% LTV mock
      ltvBps: 8000,
      breakdown: {
        grossValueUsd: 10000,
        timeFactor: 0.95,
        volFactor: 0.9,
        omegaFactor: 0.95,
        liquidityFactor: 1.0
      }
    };

    res.json({ success: true, valuation: mockValuation, status: 'MOCK_FALLBACK' });
  } catch (err) {
    console.error(`[API] /api/vesting/valuation/${req.params.id} error:`, err.message);
    res.status(500).json({ success: false, error: 'Valuation failed' });
  }
});

module.exports = router;
