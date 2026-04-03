// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './api.js';

const DEFAULT_POLL_MS = 60_000; // 60s polling interval

const EMPTY_DATA = {
    summary: { totalNetWorthUsd: 0, totalLiquidUsd: 0, totalDefiUsd: 0, chainBreakdown: {} },
    assets: { liquid: [], vested: [], defi: [] },
    linkedWallets: null
};

/**
 * useWalletScanner
 * Polls the backend GET /api/scanner/portfolio/:wallet for a rich
 * multi-chain portfolio view (EVM + Solana).
 *
 * @param {string|null} address - wallet address (EVM or Solana)
 * @param {string} chainType - 'evm' | 'solana' | 'all'
 * @param {number} [pollMs=60000] - auto-refresh interval in ms
 */
export default function useWalletScanner(address, chainType = 'all', pollMs = DEFAULT_POLL_MS) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(EMPTY_DATA);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const activeRef = useRef(true);
    const pollTimer = useRef(null);

    const fetchPortfolio = useCallback(async () => {
        if (!address) {
            setData(EMPTY_DATA);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const chain = chainType === 'evm' ? 'evm' : chainType === 'solana' ? 'solana' : 'all';
            const result = await apiGet(`/api/scanner/portfolio/${encodeURIComponent(address)}?chain=${chain}`);
            if (!activeRef.current) return;
            setData({
                summary: result.summary || EMPTY_DATA.summary,
                assets: result.assets || EMPTY_DATA.assets
            });
            setLastUpdated(Date.now());
        } catch (err) {
            if (!activeRef.current) return;
            setError(err?.message || 'Failed to fetch portfolio');
            // Keep stale data visible
        } finally {
            if (activeRef.current) setLoading(false);
        }
    }, [address, chainType]);

    useEffect(() => {
        activeRef.current = true;
        fetchPortfolio();

        if (pollMs > 0) {
            pollTimer.current = setInterval(fetchPortfolio, pollMs);
        }

        return () => {
            activeRef.current = false;
            clearInterval(pollTimer.current);
        };
    }, [fetchPortfolio, pollMs]);

    return { loading, data, error, lastUpdated, refetch: fetchPortfolio };
}
