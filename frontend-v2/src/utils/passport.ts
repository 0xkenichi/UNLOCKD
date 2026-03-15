/**
 * Ported from legacy frontend/src/utils/passport.js
 */

export interface PassportAttestation {
  provider: string;
  score: number;
  stampsCount: number;
}

export interface PassportSnapshot {
  score: number | null;
  stamps: number | null;
}

export function getPassportSnapshotFromAttestations(attestations: any[] = []): PassportSnapshot {
  const list = Array.isArray(attestations) ? attestations : [];
  const passportAttestation = list.find(
    (item) => String(item?.provider || '').toLowerCase() === 'gitcoin_passport'
  );
  
  return {
    score: passportAttestation?.score ?? null,
    stamps: passportAttestation?.stampsCount ?? null
  };
}
