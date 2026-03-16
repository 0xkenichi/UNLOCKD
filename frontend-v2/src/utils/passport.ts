/**
 * Ported from legacy frontend/src/utils/passport.js
 */

export interface PassportAttestation {
  provider: string;
  score: number;
  stampsCount: number;
}

export interface IdentityPolicy {
  band: string;
  allowed: boolean;
  requiredTier: number;
  requiredScore: number;
}

export interface PassportSnapshot {
  score: number | null;
  stamps: number | null;
  identityTier?: number;
  tierName?: string;
  compositeScore?: number;
  ias?: number;
  fbs?: number;
  walletAgeBaseScore?: number;
  multiplier?: number;
  policy?: {
    small: IdentityPolicy;
    medium: IdentityPolicy;
    large: IdentityPolicy;
  };
}

export function getPassportSnapshotFromAttestations(attestations: any[] = [], profile: any = {}): PassportSnapshot {
  const list = Array.isArray(attestations) ? attestations : [];
  const passportAttestation = list.find(
    (item) => String(item?.provider || '').toLowerCase() === 'gitcoin_passport'
  );
  
  return {
    score: passportAttestation?.score ?? profile.score ?? null,
    stamps: passportAttestation?.stampsCount ?? profile.stampsCount ?? null,
    identityTier: profile.identityTier,
    tierName: profile.tierName,
    compositeScore: profile.compositeScore,
    ias: profile.ias,
    fbs: profile.fbs,
    walletAgeBaseScore: profile.walletAgeBaseScore,
    multiplier: profile.multiplier,
    policy: profile.policy
  };
}
