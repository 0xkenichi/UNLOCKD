// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
export function getPassportSnapshotFromAttestations(attestations = []) {
  const list = Array.isArray(attestations) ? attestations : [];
  const passportAttestation = list.find(
    (item) => String(item?.provider || '').toLowerCase() === 'gitcoin_passport'
  );
  return {
    score: passportAttestation?.score ?? null,
    stamps: passportAttestation?.stampsCount ?? null
  };
}
