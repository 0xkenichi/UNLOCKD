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

    // 1. Fetch source from DB
    const sources = await persistence.listVestingSources({ limit: 1000 });
    const source = sources.find(s => s.id === id);
    if (!source) return res.status(404).json({ success: false, error: 'Source not found' });

    // 2. Value on-chain via ValuationEngine.computeDPV(quantity, token, unlockTime, vestingContract).
    //    token / quantity / unlockTime come from the query string or the source metadata.
    const meta = source.metadata && typeof source.metadata === 'object' ? source.metadata : {};
    const token = String(req.query.token || meta.token || meta.tokenAddress || '').trim();
    const quantity = String(req.query.quantity || meta.quantity || meta.amount || '').trim();
    const unlockTime = Number(req.query.unlockTime || meta.unlockTime || meta.endTime || 0);
    const computeEvmDpv = req.app.get('computeEvmDpv');

    if (!token || !/^\d+$/.test(quantity) || !unlockTime || typeof computeEvmDpv !== 'function') {
      return res.json({
        success: true,
        valuation: null,
        status: 'INPUTS_MISSING',
        required: ['token', 'quantity (raw units)', 'unlockTime (unix seconds)']
      });
    }

    const valuation = await computeEvmDpv({
      quantity,
      token,
      unlockTime,
      vestingContract: source.vestingContract || source.lockupAddress || null
    });
    if (!valuation.pvRaw || valuation.pvRaw === '0') {
      return res.json({ success: true, valuation: null, status: 'UNAVAILABLE', error: valuation.error || null });
    }

    res.json({
      success: true,
      valuation: {
        dpvUsdc: valuation.pvRaw,
        pvUsd: valuation.pv,
        ltvBps: valuation.ltvBps,
        maxBorrowUsdc: valuation.maxBorrowRaw,
        source: valuation.source
      },
      status: valuation.source === 'computeDPV' ? 'ONCHAIN' : 'ESTIMATE'
    });
  } catch (err) {
    console.error(`[API] /api/vesting/valuation/${req.params.id} error:`, err.message);
    res.status(500).json({ success: false, error: 'Valuation failed' });
  }
});

/**
 * @api {get} /api/vesting/open-claims Get all open borrow requests (claims)
 */
router.get('/open-claims', async (req, res) => {
  try {
    const events = await persistence.listMatchEvents({ limit: 50 });
    
    // Filter for quote events
    const quotes = events.filter(e => e.type === 'quote' || e.type === 'quote_missing_valuation');
    
    // Deduplicate by collateralId/streamId and format for frontend
    const seen = new Set();
    const claims = [];
    
    for (const event of quotes) {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      const key = payload.collateralId || payload.streamId;
      
      if (key && !seen.has(key)) {
        seen.add(key);
        
        claims.push({
          id: event.id,
          tokenName: payload.tokenSymbol || payload.tokenName || 'Vestra Asset',
          requestedAmount: payload.desiredAmountUsd || '0',
          collateralValue: payload.pvUsd ? payload.pvUsd.toString() : '0',
          daysRemaining: payload.unlockTime ? Math.max(0, Math.floor((payload.unlockTime - Date.now() / 1000) / 86400)).toString() : '30',
          collateralId: key
        });
      }
    }

    res.json({
      success: true,
      data: claims
    });
  } catch (err) {
    console.error('[API] /api/vesting/open-claims error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch open claims'
    });
  }
});

module.exports = router;
