const API_BASE =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

function readAuthToken() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem('wallet-auth');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed?.token || '';
  } catch (error) {
    return '';
  }
}

export async function apiPost(path, payload = {}, options = {}) {
  const authToken = options.sessionToken || readAuthToken();
  const bodyPayload = {
    ...payload,
    ...(options.captchaToken ? { captchaToken: options.captchaToken } : {})
  };
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify(bodyPayload)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function apiDownload(path, filename) {
  const response = await fetch(`${API_BASE}${path}`);
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

export async function fetchVestedContracts() {
  const data = await apiGet('/api/vested-contracts');
  return data.items || [];
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

export async function fetchSolanaUnmappedMints() {
  const data = await apiGet('/api/solana/unmapped-mints');
  return data.items || [];
}

export async function askAgent(message, history = [], captchaToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const authToken = readAuthToken();
    const payload = { message, history };
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
      actions: data.actions || []
    };
  } finally {
    clearTimeout(timeout);
  }
}
