/**
 * Centralized API utility for Vestra Protocol.
 * Handles production vs development environment switching.
 */

const IS_PROD = typeof window !== 'undefined' && 
  (window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1'));

const API_URL = process.env.NEXT_PUBLIC_API_URL || 
  (IS_PROD ? 'https://vestra-backend-stack.vercel.app' : 'http://localhost:4000');

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('API Fetch Error:', error);
    
    // If it's already an Error with a message we set (like "API error: ..."), rethrow it
    if (error.message && error.message.startsWith('API error:')) {
      throw error;
    }

    // Provide a more descriptive error message for network errors on localhost
    if (API_URL.includes('localhost')) {
      throw new Error('Cannot reach backend API. Ensure backend is running locally on port 4000.');
    } else {
      throw new Error('Cannot reach production backend API. Please check your connection or try again later.');
    }
  }
}

export const api = {
  get: (endpoint: string) => fetchApi(endpoint, { method: 'GET' }),
  post: (endpoint: string, body: any) => fetchApi(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  
  // Protocol specific
  fetchKpi: (windowHours = 24) => fetchApi(`/api/platform/snapshot?hours=${windowHours}`),
  fetchActivity: () => fetchApi('/api/activity'),
  fetchTvlHistory: () => fetchApi('/api/analytics/tvl-history'),
  fetchMarketQuotes: () => fetchApi('/api/market/quotes'),
  fetchPerformance: (wallet: string) => fetchApi(`/api/analytics/performance?wallet=${wallet}`),
  fetchYieldHistory: () => fetchApi('/api/analytics/yield-history'),
  fetchVestedContracts: (params: { walletAddress?: string; chain?: string; privacyMode?: boolean } = {}) => {
    if (params.walletAddress) {
      return api.fetchPortfolio(params.walletAddress, params.chain || 'all')
        .then(data => data.assets?.vested || []);
    }
    const query = new URLSearchParams();
    if (params.chain) query.set('chain', params.chain);
    if (params.privacyMode) query.set('privacy', '1');
    return fetchApi(`/api/vested-contracts?${query.toString()}`);
  },
  fetchPools: (params: { chain?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.chain) query.set('chain', params.chain);
    if (params.status) query.set('status', params.status);
    return fetchApi(`/api/pools?${query.toString()}`);
  },
  faucetUsdc: (address: string) => fetchApi('/api/faucet/usdc', {
    method: 'POST',
    body: JSON.stringify({ address })
  }),

  // AI Agent specific
  askAgent: async (message: string, history: Message[] = [], captchaToken?: string, context: Record<string, any> | null = null) => {
    const payload: { message: string; history: Message[]; context?: Record<string, any>; captchaToken?: string } = { message, history };
    if (context) payload.context = context;
    if (captchaToken) payload.captchaToken = captchaToken;
    
    return fetchApi('/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  requestMatchQuote: (payload: Record<string, any>) => fetchApi('/api/match/quote', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  fetchIdentity: (walletAddress: string) => fetchApi(`/api/identity/${walletAddress}`),
  fetchLoans: (walletAddress: string) => fetchApi(`/api/loans?wallet=${walletAddress}`),
  fetchDeposits: (walletAddress: string) => fetchApi(`/api/lend?wallet=${walletAddress}`),
  depositCapital: (payload: { wallet: string, amount: string, apyBps: number, durationDays?: number }) => 
    fetchApi('/api/lend/deposit', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  withdrawDeposit: (id: string, wallet: string) => fetchApi('/api/lend/withdraw', {
    method: 'POST',
    body: JSON.stringify({ id, walletAddress: wallet })
  }),
  fetchPortfolio: (walletAddress: string, _chain = 'all') => fetchApi(`/api/portfolio/${walletAddress}`),
  warpTime: (seconds: number) => fetchApi('/api/faucet/warp', {
    method: 'POST',
    body: JSON.stringify({ seconds })
  }),
  generateVesting: (payload: { wallet: string, symbol: string, amount: string }) => fetchApi('/api/faucet/generate-vesting', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  fetchVestingFeed: (limit = 10) => fetchApi(`/api/vesting/feed?limit=${limit}`),
  fetchVestingAll: (limit = 50) => fetchApi(`/api/vesting/all?limit=${limit}`),
  fetchOpenVestingClaims: () => fetchApi('/api/vesting/open-claims'),
  verifyIdentity: (walletAddress: string) => fetchApi('/api/identity/verify', {
    method: 'POST',
    body: JSON.stringify({ walletAddress })
  }),
  associateVestingName: (contractAddress: string, name: string) => fetchApi('/api/faucet/associate-name', {
    method: 'POST',
    body: JSON.stringify({ contractAddress, name })
  }),
  fetchRepaySchedule: () => fetchApi('/api/exports/repay-schedule'),
  repayLoan: (payload: { loanId: string, amount: string }) => fetchApi('/api/relayer/evm/repay-private-loan', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  settlePrivateLoan: (payload: { loanId: string }) => fetchApi('/api/relayer/evm/settle-private-loan', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  fetchAdminAirdropLeaderboard: (windowDays = 30, limit = 200, phase = 'all') => 
    fetchApi(`/api/admin/airdrop/leaderboard?windowDays=${windowDays}&limit=${limit}&phase=${phase}`),
  fetchAdminRiskFlags: (wallet?: string, token?: string) => {
    const query = new URLSearchParams();
    if (wallet) query.set('wallet', wallet);
    if (token) query.set('token', token);
    return fetchApi(`/api/admin/risk/flags?${query.toString()}`);
  },
  createAdminRiskFlag: (payload: any) => fetchApi('/api/admin/risk/flags', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteAdminRiskFlag: (id: string) => fetchApi(`/api/admin/risk/flags/${id}`, {
    method: 'DELETE'
  }),
  fetchAdminRiskCohort: (by = 'borrower', limit = 100) => 
    fetchApi(`/api/admin/risk/cohort?by=${by}&limit=${limit}`),
  fetchAgentReplay: (windowHours = 48) => 
    fetchApi(`/api/agent/replay?windowHours=${windowHours}`),
  fetchOmegaAlerts: () => fetchApi('/api/omega/alerts'),
  fetchSimulationState: () => fetchApi('/api/simulation/state'),
  fetchCommunityPools: (params: { walletAddress?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.walletAddress) query.set('wallet', params.walletAddress);
    return fetchApi(`/api/community/pools?${query.toString()}`);
  },
  fetchCommunityPool: (poolId: string, walletAddress?: string) => {
    const query = new URLSearchParams();
    if (walletAddress) query.set('wallet', walletAddress);
    return fetchApi(`/api/community/pools/${poolId}?${query.toString()}`);
  },
  downloadAdminAirdropLeaderboard: (windowDays = 30, limit = 200, phase = 'all') => {
    window.open(`${API_URL}/api/admin/airdrop/leaderboard/export?windowDays=${windowDays}&limit=${limit}&phase=${phase}`, '_blank');
  }
};

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const askAgent = api.askAgent;
export const requestMatchQuote = api.requestMatchQuote;
export const fetchIdentity = api.fetchIdentity;
