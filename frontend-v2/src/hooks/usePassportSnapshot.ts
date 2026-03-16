import { useState, useEffect } from 'react';
import { api } from '@/utils/api';
import { getPassportSnapshotFromAttestations, PassportSnapshot } from '@/utils/passport';

export interface PassportSummary extends PassportSnapshot {
  loading: boolean;
  error: string | null;
}

export function usePassportSnapshot(address: string | undefined): PassportSummary {
  const [passportSummary, setPassportSummary] = useState<PassportSummary>({
    loading: false,
    score: null,
    stamps: null,
    error: null
  });

  useEffect(() => {
    if (!address) {
      setPassportSummary({ loading: false, score: null, stamps: null, error: null });
      return;
    }

    let active = true;
    setPassportSummary((prev) => ({ ...prev, loading: true, error: null }));

    api.fetchIdentity(address)
      .then((profile: any) => {
        if (!active) return;
        const snapshot = getPassportSnapshotFromAttestations(profile?.attestations, profile);
        setPassportSummary({
          loading: false,
          ...snapshot,
          error: null
        } as PassportSummary);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Error fetching passport snapshot:', err);
        setPassportSummary({ 
          loading: false, 
          score: null, 
          stamps: null, 
          error: err instanceof Error ? err.message : 'Failed to fetch passport' 
        });
      });

    return () => {
      active = false;
    };
  }, [address]);

  return passportSummary;
}
