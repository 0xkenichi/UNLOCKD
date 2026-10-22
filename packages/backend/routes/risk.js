// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const express = require('express');
const { createRiskSnapshotStore } = require('../lib/RiskSnapshotService');

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * @api {get} /api/risk/tokens               Tokens with a risk snapshot
 * @api {get} /api/risk/tokens/:address      One token's snapshot: spot, volatility, ADV,
 *                                           recommended Ω, per-loan cap, monitor alerts
 * @apiGroup Risk
 */
function createRiskRouter(store = createRiskSnapshotStore()) {
  const router = express.Router();
  const notGenerated = (res) =>
    res.status(503).json({ ok: false, error: 'Risk snapshots have not been generated (packages/risk: npm run refresh)' });

  router.get('/tokens', (_req, res) => {
    const list = store.list();
    if (!list) return notGenerated(res);
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ ok: true, ...list });
  });

  router.get('/tokens/:address', (req, res) => {
    const { address } = req.params;
    if (!EVM_ADDRESS.test(address) && !SOLANA_MINT.test(address)) {
      return res.status(400).json({ ok: false, error: 'Expected a token address' });
    }
    if (!store.available()) return notGenerated(res);
    const found = store.get(address);
    if (!found) return res.status(404).json({ ok: false, error: 'No risk snapshot for this token' });
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ ok: true, generatedAt: found.generatedAt, snapshot: found.snapshot });
  });

  return router;
}

module.exports = createRiskRouter;
