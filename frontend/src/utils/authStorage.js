// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const AUTH_STORAGE_KEY = 'wallet-auth';

const getStorage = (kind) => {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

const parseAuth = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const expiresAtMs = parsed?.expiresAt ? Date.parse(parsed.expiresAt) : null;
    if (expiresAtMs && Date.now() > expiresAtMs) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export function readWalletAuth() {
  const session = getStorage('session');
  const local = getStorage('local');
  const sessionAuth = parseAuth(session?.getItem(AUTH_STORAGE_KEY));
  if (sessionAuth) return sessionAuth;

  const localAuth = parseAuth(local?.getItem(AUTH_STORAGE_KEY));
  if (!localAuth) {
    local?.removeItem(AUTH_STORAGE_KEY);
    return null;
  }

  // One-way migration: keep auth in session storage only.
  try {
    session?.setItem(AUTH_STORAGE_KEY, JSON.stringify(localAuth));
  } catch {
    // Ignore storage failures and return parsed auth.
  }
  local?.removeItem(AUTH_STORAGE_KEY);
  return localAuth;
}

export function writeWalletAuth(value) {
  const session = getStorage('session');
  const local = getStorage('local');
  if (!value) {
    session?.removeItem(AUTH_STORAGE_KEY);
    local?.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  try {
    session?.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore write errors.
  }
  local?.removeItem(AUTH_STORAGE_KEY);
}

export function readWalletAuthToken() {
  return readWalletAuth()?.token || '';
}
