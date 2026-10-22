// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const fs = require('fs');
const path = require('path');

/*
 * Per-token risk snapshots written by the risk engine's daily refresh
 * (packages/risk: `npm run refresh` → data/snapshots.json). Read-only here: the file is
 * re-read when it changes, so a refresh takes effect without a restart.
 */

const DEFAULT_PATH = path.resolve(__dirname, '../../risk/data/snapshots.json');

// Same rule as packages/risk/src/ingest.js addressKey: EVM addresses compare lower-cased,
// Solana mints are case-sensitive.
const addressKey = (address) => {
  const a = String(address || '').trim();
  return /^0x[0-9a-f]+$/i.test(a) ? a.toLowerCase() : a;
};

function createRiskSnapshotStore({ file = process.env.RISK_SNAPSHOTS_PATH || DEFAULT_PATH } = {}) {
  let cache = null;

  function load() {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return null;
    }
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache;
    const index = JSON.parse(fs.readFileSync(file, 'utf8'));
    const byAddress = new Map();
    for (const snapshot of index.tokens || []) {
      for (const { address } of snapshot.addresses || []) {
        const key = addressKey(address);
        if (key && !byAddress.has(key)) byAddress.set(key, snapshot);
      }
    }
    cache = { mtimeMs: stat.mtimeMs, index, byAddress };
    return cache;
  }

  return {
    file,
    available: () => load() !== null,
    /** @returns {{ generatedAt, snapshot } | null} */
    get(address) {
      const c = load();
      const snapshot = c?.byAddress.get(addressKey(address));
      return snapshot ? { generatedAt: c.index.generatedAt, snapshot } : null;
    },
    list() {
      const c = load();
      if (!c) return null;
      return {
        generatedAt: c.index.generatedAt,
        source: c.index.source,
        tokens: (c.index.tokens || []).map((s) => ({
          symbol: s.symbol,
          coingeckoId: s.coingeckoId,
          addresses: s.addresses,
          dataDate: s.dataDate,
          monitor: s.monitor?.status
        }))
      };
    }
  };
}

module.exports = { createRiskSnapshotStore, addressKey, DEFAULT_PATH };
