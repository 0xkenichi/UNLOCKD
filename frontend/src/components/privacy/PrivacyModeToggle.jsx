// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect } from 'react';
import { usePrivacyMode } from '../../utils/privacyMode.js';

export default function PrivacyModeToggle({ compact = false, onChange } = {}) {
  const { enabled, setEnabled } = usePrivacyMode();

  useEffect(() => {
    if (typeof onChange === 'function') onChange(enabled);
  }, [enabled, onChange]);

  return (
    <div className="inline-actions" style={{ gap: 10, alignItems: 'center' }}>
      <span className="chip">{enabled ? 'Private mode: ON' : 'Private mode: OFF'}</span>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="muted" style={{ fontSize: compact ? 12 : 13 }}>
          Recommended for founders, institutions, and top holders
        </span>
      </label>
    </div>
  );
}

