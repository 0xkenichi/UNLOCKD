// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api.js';

/*
 * The risk engine's latest snapshot for one token (GET /api/risk/tokens/:address): measured
 * volatility, ADV, recommended Ω, per-loan cap and monitor alerts, with the data date.
 * Null while loading, and for any token the engine has not calibrated (the backend answers
 * 404) — callers must work without it.
 */

const addressKey = (address) => {
  const a = String(address || '').trim();
  return /^0x[0-9a-f]+$/i.test(a) ? a.toLowerCase() : a;
};

export async function fetchRiskSnapshot(address) {
  try {
    const data = await apiGet(`/api/risk/tokens/${encodeURIComponent(addressKey(address))}`);
    return data?.snapshot || null;
  } catch {
    return null;
  }
}

export function useRiskSnapshot(tokenAddress) {
  const key = addressKey(tokenAddress);
  const { data } = useQuery({
    queryKey: ['risk-snapshot', key],
    queryFn: () => fetchRiskSnapshot(key),
    enabled: Boolean(key),
    staleTime: 10 * 60_000,
    retry: false
  });
  return data || null;
}
