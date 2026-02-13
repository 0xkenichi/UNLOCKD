import { useEffect, useState } from 'react';
import { fetchIdentity } from './api.js';
import { getPassportSnapshotFromAttestations } from './passport.js';

export default function usePassportSnapshot(address) {
  const [passportSummary, setPassportSummary] = useState({
    loading: false,
    score: null,
    stamps: null
  });

  useEffect(() => {
    if (!address) {
      setPassportSummary({ loading: false, score: null, stamps: null });
      return;
    }
    let active = true;
    setPassportSummary((prev) => ({ ...prev, loading: true }));
    fetchIdentity(address)
      .then((profile) => {
        if (!active) return;
        const snapshot = getPassportSnapshotFromAttestations(profile?.attestations);
        setPassportSummary({
          loading: false,
          score: snapshot.score,
          stamps: snapshot.stamps
        });
      })
      .catch(() => {
        if (!active) return;
        setPassportSummary({ loading: false, score: null, stamps: null });
      });
    return () => {
      active = false;
    };
  }, [address]);

  return passportSummary;
}
