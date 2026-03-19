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
      error: 'Failed to fetch all vesting data'
    });
  }
});

/**
 * @api {get} /api/vesting/:id Get specific vesting source details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Note: We'll use listVestingSources and filter locally if a single-get isn't explicitly in persistence.js
    const sources = await persistence.listVestingSources({ limit: 1000 });
    const source = sources.find(s => s.id === id);
    
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Vesting source not found'
      });
    }

    res.json({
      success: true,
      data: source
    });
  } catch (err) {
    console.error(`[API] /api/vesting/${req.params.id} error:`, err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vesting source'
    });
  }
});

module.exports = router;
