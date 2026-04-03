// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';

const TIER_NAMES = {
  0: 'Anonymous',
  1: 'Basic',
  2: 'Standard',
  3: 'Verified',
  4: 'Trusted',
  5: 'Institutional'
};

export default function TierBadge({
  tier,
  tierName,
  compositeScore,
  size = 'medium',
  showScore = false
}) {
  const label = useMemo(() => {
    if (tierName && TIER_NAMES[tier] !== tierName) return tierName;
    return TIER_NAMES[Number(tier)] ?? 'Anonymous';
  }, [tier, tierName]);

  const tierNum = Number(tier) ?? 0;
  const tierClass = `tier-badge tier-badge--tier-${Math.min(5, Math.max(0, tierNum))} tier-badge--${size}`;

  return (
    <span className={tierClass} title={showScore && compositeScore != null ? `Score: ${compositeScore}` : label}>
      <span className="tier-badge__label">{label}</span>
      {showScore && compositeScore != null && (
        <span className="tier-badge__score">{compositeScore}</span>
      )}
    </span>
  );
}
