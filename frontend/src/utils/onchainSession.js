import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_EVM_CHAIN } from './chains.js';
import { apiPost } from './api.js';

const SESSION_KEY = ['onchain-session'];
const AUTH_STORAGE_KEY = 'wallet-auth';

const defaultSession = {
  chainType: 'evm',
  evmChainId: DEFAULT_EVM_CHAIN.id,
  solanaNetworkId: 'mainnet-beta',
  onrampProvider: 'onramper',
  bridgeProvider: 'lifi'
};

function readSession() {
  if (typeof window === 'undefined') {
    return defaultSession;
  }
  try {
    const raw = window.localStorage.getItem('onchain-session');
    if (!raw) return defaultSession;
    return { ...defaultSession, ...JSON.parse(raw) };
  } catch (error) {
    console.warn('Failed to read onchain session', error);
    return defaultSession;
  }
}

function writeSession(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('onchain-session', JSON.stringify(value));
  } catch (error) {
    console.warn('Failed to write onchain session', error);
  }
}

function readAuth() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const expiresAtMs = parsed?.expiresAt ? Date.parse(parsed.expiresAt) : null;
    if (expiresAtMs && Date.now() > expiresAtMs) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to read auth session', error);
    return null;
  }
}

function writeAuth(value) {
  if (typeof window === 'undefined') return;
  try {
    if (!value) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
    }
  } catch (error) {
    console.warn('Failed to write auth session', error);
  }
}

export async function requestWalletSession({ address, signMessageAsync }) {
  if (!address || !signMessageAsync) {
    throw new Error('Wallet connection required');
  }
  const nonceResponse = await apiPost('/api/auth/nonce', { walletAddress: address });
  if (!nonceResponse?.nonce || !nonceResponse?.message) {
    throw new Error('Unable to request nonce');
  }
  const signature = await signMessageAsync({ message: nonceResponse.message });
  const verifyResponse = await apiPost('/api/auth/verify', {
    walletAddress: address,
    nonce: nonceResponse.nonce,
    signature
  });
  if (!verifyResponse?.sessionToken) {
    throw new Error('Unable to verify signature');
  }
  const auth = {
    token: verifyResponse.sessionToken,
    walletAddress: verifyResponse.walletAddress || address,
    expiresAt: verifyResponse.expiresAt || null
  };
  writeAuth(auth);
  return auth;
}

export function clearWalletSession() {
  writeAuth(null);
}

export function useWalletSession() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['wallet-auth'],
    queryFn: () => readAuth(),
    initialData: readAuth(),
    staleTime: Infinity
  });

  const setAuth = useCallback(
    (update) => {
      client.setQueryData(['wallet-auth'], (prev) => {
        const next =
          typeof update === 'function' ? update(prev) : { ...prev, ...update };
        writeAuth(next);
        return next;
      });
    },
    [client]
  );

  return {
    auth: query.data,
    setAuth
  };
}

export function useOnchainSession() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => readSession(),
    initialData: readSession(),
    staleTime: Infinity
  });

  const setSession = useCallback(
    (update) => {
      client.setQueryData(SESSION_KEY, (prev) => {
        const next =
          typeof update === 'function' ? update(prev) : { ...prev, ...update };
        writeSession(next);
        return next;
      });
    },
    [client]
  );

  return {
    session: query.data,
    setSession
  };
}
