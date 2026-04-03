// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'vestra:privacyMode';

export function getPrivacyMode() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setPrivacyMode(enabled) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore - storage can be blocked in some contexts
  }
}

export function usePrivacyMode() {
  const [enabled, setEnabled] = useState(() => getPrivacyMode());

  useEffect(() => {
    const handler = (event) => {
      if (event?.key !== STORAGE_KEY) return;
      setEnabled(getPrivacyMode());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const update = useCallback((next) => {
    const value = Boolean(next);
    setPrivacyMode(value);
    setEnabled(value);
  }, []);

  return useMemo(() => ({ enabled, setEnabled: update }), [enabled, update]);
}

