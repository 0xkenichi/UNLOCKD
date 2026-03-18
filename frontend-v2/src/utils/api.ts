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
    const query = new URLSearchParams();
    if (params.walletAddress) query.set('wallet', params.walletAddress);
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
  fetchPortfolio: (walletAddress: string, chain = 'all') => fetchApi(`/api/scanner/portfolio/${walletAddress}?chain=${chain}`),
  warpTime: (seconds: number) => fetchApi('/api/faucet/warp', {
    method: 'POST',
    body: JSON.stringify({ seconds })
  }),
  generateVesting: (payload: { wallet: string, symbol: string, amount: string }) => fetchApi('/api/faucet/generate-vesting', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  fetchVestingFeed: (limit = 10) => fetchApi(`/api/vesting/feed?limit=${limit}`)
};

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const askAgent = api.askAgent;
export const requestMatchQuote = api.requestMatchQuote;
export const fetchIdentity = api.fetchIdentity;
