// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_EVM_CHAIN } from './chains.js';
import { apiPost } from './api.js';
import { readWalletAuth, writeWalletAuth } from './authStorage.js';
import { trackEvent } from './analytics.js';

const SESSION_KEY = ['onchain-session'];

const defaultSession = {
  chainType: 'evm',
  primaryIdentity: 'evm',
  evmChainId: DEFAULT_EVM_CHAIN.id,
  evmWalletAddress: null,
  solanaNetworkId: DEFAULT_EVM_CHAIN.testnet ? 'devnet' : 'mainnet-beta',
  solanaWalletAddress: null,
  solanaWalletName: null,
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
  return readWalletAuth();
}

function writeAuth(value) {
  writeWalletAuth(value);
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
    expiresAt: verifyResponse.expiresAt || null,
    linkedWallets: Array.isArray(verifyResponse.linkedWallets)
      ? verifyResponse.linkedWallets
      : []
  };
  writeAuth(auth);
  trackEvent('wallet_session_created', {
    walletAddress: auth.walletAddress
  });
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

export function getActiveIdentity(session, evmAddress) {
  const chainType = session?.chainType === 'solana' ? 'solana' : 'evm';
  const primaryIdentity = session?.primaryIdentity === 'solana' ? 'solana' : 'evm';
  const evmWalletAddress = evmAddress || session?.evmWalletAddress || null;
  const solanaWalletAddress = session?.solanaWalletAddress || null;
  const hasBothWallets = Boolean(evmWalletAddress && solanaWalletAddress);
  const preferred = hasBothWallets ? primaryIdentity : chainType;
  if (preferred === 'solana' && solanaWalletAddress) {
    return {
      chainType: 'solana',
      walletAddress: solanaWalletAddress,
      hasBothWallets
    };
  }
  return {
    chainType: 'evm',
    walletAddress: evmWalletAddress,
    hasBothWallets
  };
}
