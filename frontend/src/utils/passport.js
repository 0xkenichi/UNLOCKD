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
