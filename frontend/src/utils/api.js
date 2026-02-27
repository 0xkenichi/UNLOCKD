import { readWalletAuthToken } from './authStorage.js';

const API_BASE =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000);
const API_GET_RETRIES = Number(import.meta.env.VITE_API_GET_RETRIES || 1);

function readAuthToken() {
  return readWalletAuthToken();
}

function normalizeNetworkError(error) {
  if (error?.name === 'AbortError') {
    return new Error('Request timed out');
  }
  // Browser fetch throws TypeError("Failed to fetch") when backend is unreachable.
  if (error instanceof TypeError) {
    return new Error('Cannot reach backend API. Ensure backend is running on localhost:4000.');
  }
  return error;
}

export async function apiPost(path, payload = {}, options = {}) {
  const authToken = options.sessionToken || readAuthToken();
  const bodyPayload = {
    ...payload,
    ...(options.captchaToken ? { captchaToken: options.captchaToken } : {})
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    const data = await response.json();
    if (data && data.ok === false) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (error) {
    throw normalizeNetworkError(error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiGet(path) {
  const authToken = readAuthToken();
  for (let attempt = 0; attempt <= API_GET_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        signal: controller.signal
      });
      if (!response.ok) {
        if (
          attempt < API_GET_RETRIES &&
          (response.status === 429 || response.status >= 500)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
        throw new Error(`Request failed: ${response.status}`);
      }
      const data = await response.json();
      if (data && data.ok === false) {
        throw new Error(data.error || 'Request failed');
      }
      return data;
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      if (attempt < API_GET_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
      if (timedOut) {
        throw new Error('Request timed out');
      }
      throw normalizeNetworkError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Request failed');
}

export async function apiDelete(path) {
  const authToken = readAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const data = await response.json().catch(() => ({}));
  if (data && data.ok === false) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export async function apiDownload(path, filename) {
  const authToken = readAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename || 'download.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function fetchActivity() {
  const data = await apiGet('/api/activity');
  return { items: data.items || [], meta: data.meta || null };
}

export async function fetchRepaySchedule() {
  const data = await apiGet('/api/repay-schedule');
  return data.items || [];
}

export async function fetchVestedContracts({ walletAddress, chain, privacyMode } = {}) {
  const params = new URLSearchParams();
  if (walletAddress) params.set('wallet', walletAddress);
  if (chain) params.set('chain', chain);
  if (privacyMode) params.set('privacy', '1');
  const query = params.toString();
  const endpoint = `/api/vested-contracts${query ? `?${query}` : ''}`;
  try {
    const data = await apiGet(endpoint);
    return data.items || [];
  } catch (error) {
    const msg = String(error?.message || '');
    if (!/Request failed:\s*404/i.test(msg)) {
      throw error;
    }
    if (privacyMode) {
      // Avoid falling back to public snapshots in private mode.
      throw error;
    }
    const snapshots = await apiGet('/api/vested-snapshots?full=1');
    const latestItems = snapshots?.snapshots?.[0]?.items || [];
    const normalizedWallet = String(walletAddress || '').trim().toLowerCase();
    const normalizedChain = String(chain || '').trim().toLowerCase();
    return latestItems.filter((item) => {
      if (normalizedChain && String(item?.chain || '').trim().toLowerCase() !== normalizedChain) {
        return false;
      }
      if (!normalizedWallet) return true;
      const borrower = String(item?.borrower || '').trim().toLowerCase();
      // In privacy mode, the backend may omit borrower fields.
      if (!borrower && privacyMode) return true;
      return borrower === normalizedWallet;
    });
  }
}

export async function fetchPools({ chain, ownerWallet, status } = {}) {
  const params = new URLSearchParams();
  if (chain) params.set('chain', chain);
  if (ownerWallet) params.set('ownerWallet', ownerWallet);
  if (status) params.set('status', status);
  const query = params.toString();
  const data = await apiGet(`/api/pools${query ? `?${query}` : ''}`);
  return data.pools || [];
}

export async function fetchCommunityPools({ walletAddress, limit } = {}) {
  const params = new URLSearchParams();
  if (walletAddress) params.set('wallet', walletAddress);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  const data = await apiGet(`/api/community-pools${query ? `?${query}` : ''}`);
  return data.items || [];
}

export async function fetchCommunityPool(poolId, walletAddress) {
  const query = walletAddress ? `?wallet=${encodeURIComponent(walletAddress)}` : '';
  const data = await apiGet(`/api/community-pools/${poolId}${query}`);
  return data.item || null;
}

export async function fetchIdentity(walletAddress) {
  if (!walletAddress) {
    return { ok: false, error: 'Wallet address required' };
  }
  const data = await apiGet(`/api/identity/${walletAddress}`);
  return data;
}

export async function fetchPassportScore(walletAddress) {
  if (!walletAddress) {
    return { ok: false, error: 'Wallet address required' };
  }
  const data = await apiGet(`/api/identity/passport-score/${walletAddress}`);
  return data;
}

export async function fetchPoolsBrowse({ chain, borrowerWallet, accessFilter } = {}) {
  const params = new URLSearchParams();
  if (chain) params.set('chain', chain);
  if (borrowerWallet) params.set('borrowerWallet', borrowerWallet);
  if (accessFilter) params.set('accessFilter', accessFilter);
  const query = params.toString();
  const data = await apiGet(`/api/pools/browse${query ? `?${query}` : ''}`);
  return {
    pools: data.pools || [],
    identityTier: data.identityTier ?? null,
    compositeScore: data.compositeScore ?? null,
    tierName: data.tierName ?? null
  };
}

export async function createPool(payload) {
  const data = await apiPost('/api/pools', payload);
  return data.pool;
}

export async function updatePoolPreferences(id, payload) {
  const data = await apiPost(`/api/pools/${id}/preferences`, payload);
  return data.pool;
}

export async function requestMatchQuote(payload) {
  const data = await apiPost('/api/match/quote', payload);
  return data;
}

export async function acceptMatchOffer(payload) {
  const data = await apiPost('/api/match/accept', payload);
  return data;
}

export async function fetchVestedSnapshots() {
  const data = await apiGet('/api/vested-snapshots');
  return data.snapshots || [];
}

export async function fetchKpiDashboard(windowHours = 24) {
  const safeWindow = Math.min(Math.max(Number(windowHours) || 24, 1), 24 * 30);
  const data = await apiGet(`/api/kpi/dashboard?windowHours=${safeWindow}`);
  return data.kpi || null;
}

export async function fetchAnalyticsBenchmark(windowDays = 30) {
  const safeWindow = Math.min(Math.max(Number(windowDays) || 30, 1), 365);
  const data = await apiGet(`/api/analytics/benchmark?windowDays=${safeWindow}`);
  return data.benchmark || null;
}

export async function fetchAgentReplay(windowHours = 48) {
  const safeWindow = Math.min(Math.max(Number(windowHours) || 48, 1), 24 * 14);
  const data = await apiGet(`/api/agent/replay?windowHours=${safeWindow}`);
  return data.replay || null;
}

export async function fetchAdminAirdropLeaderboard(windowDays = 30, limit = 200, phase = 'all') {
  const safeWindow = Math.min(Math.max(Number(windowDays) || 30, 1), 365);
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const safePhase = String(phase || 'all').trim().toLowerCase();
  const data = await apiGet(
    `/api/admin/airdrop/leaderboard?windowDays=${safeWindow}&limit=${safeLimit}&phase=${encodeURIComponent(safePhase)}`
  );
  return data.leaderboard || null;
}

export async function downloadAdminAirdropLeaderboard(windowDays = 30, limit = 200, phase = 'all') {
  const safeWindow = Math.min(Math.max(Number(windowDays) || 30, 1), 365);
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const safePhase = String(phase || 'all').trim().toLowerCase();
  await apiDownload(
    `/api/admin/airdrop/leaderboard.csv?windowDays=${safeWindow}&limit=${safeLimit}&phase=${encodeURIComponent(safePhase)}`,
    `airdrop-leaderboard-${safePhase}-${safeWindow}d.csv`
  );
}

export async function fetchAdminRiskFlags(wallet = null, token = null) {
  const params = new URLSearchParams();
  if (wallet) params.set('wallet', wallet);
  if (token) params.set('token', token);
  const data = await apiGet(`/api/admin/risk/flags?${params.toString()}`);
  return data.flags || [];
}

export async function createAdminRiskFlag(payload) {
  const data = await apiPost('/api/admin/risk/flags', payload);
  return data.flag;
}

export async function deleteAdminRiskFlag(id) {
  await apiDelete(`/api/admin/risk/flags/${id}`);
}

export async function fetchAdminRiskCohort(by = 'borrower', limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const data = await apiGet(`/api/admin/risk/cohort?by=${encodeURIComponent(by)}&limit=${safeLimit}`);
  return by === 'token' ? { byToken: data.byToken || [] } : { borrowers: data.borrowers || [] };
}

export async function fetchSolanaUnmappedMints() {
  const data = await apiGet('/api/solana/unmapped-mints');
  return data.items || [];
}

export async function fetchSolanaStatus() {
  const data = await apiGet('/api/solana/status');
  return data.status || null;
}

export async function fetchLenderProjections(amountUsd) {
  const amount = Number(amountUsd || 0);
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const data = await apiGet(`/api/lender/projections?amountUsd=${encodeURIComponent(String(safeAmount))}`);
  return data;
}

export async function fetchLenderPortfolioLight() {
  const data = await apiGet('/api/lender/portfolio-light');
  return data;
}

export async function requestChainSupport(payload = {}) {
  const data = await apiPost('/api/chains/request', payload);
  return data;
}

export async function askAgent(message, history = [], captchaToken, context = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const authToken = readAuthToken();
    const payload = { message, history };
    if (context && typeof context === 'object') payload.context = context;
    if (captchaToken) payload.captchaToken = captchaToken;
    const headers = {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    };
    const data = await fetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    }).then((res) => {
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json();
    });
    if (data && data.ok === false) {
      throw new Error(data.error || 'Agent responded with an error');
    }
    return {
      answer: data.answer || '',
      sources: data.sources || [],
      mode: data.mode || 'unknown',
      provider: data.provider || null,
      actions: data.actions || [],
      intent: data.intent || '',
      confidence:
        typeof data.confidence === 'number' && Number.isFinite(data.confidence)
          ? data.confidence
          : null
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitContact(payload) {
  const data = await apiPost('/api/contact', payload);
  return data;
}
