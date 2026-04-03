import { useState, useEffect } from 'react';
import { PassportSnapshot } from '@/utils/passport';
import { computeVcs } from '@/lib/vcsEngine';
import { api } from '@/utils/api';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface PassportSummary extends PassportSnapshot {
  loading: boolean;
  error: string | null;
  ltvBoostBps?: number;
  rateSurchargeOrDiscountBps?: number;
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

    // Fetch on-chain activity + credit history in parallel
    Promise.all([
      fetch(`/api/profile/vcs-input?address=${address}`).then(r => {
        if (!r.ok) throw new Error('Failed to fetch VCS input');
        return r.json();
      }),
      fetch(`/internal/credit-history/${address}`)
        .then(r => r.ok ? r.json() : { totalRepaidLoans: 0, totalRepaidUsd: 0, hasActiveDefaults: false, lateRepaymentCount: 0, veCrdtBalance: 0, gaugeVotesCount: 0 })
        .catch(() => ({ totalRepaidLoans: 0, totalRepaidUsd: 0, hasActiveDefaults: false, lateRepaymentCount: 0, veCrdtBalance: 0, gaugeVotesCount: 0 })),
    ])
    .then(async ([input, creditHistory]: [any, any]) => {
      if (!active) return;

      // Build the full VCS input — credit history now included
      const vcsInput = {
        gitcoinPassportScore: input.gitcoinPassportScore ?? 0,
        hasWorldID: input.hasWorldID ?? false,
        easAttestations: input.easAttestations ?? [],
        txCount: input.txCount ?? 0,
        walletAgedays: input.walletAgedays ?? 0,
        uniqueProtocolsUsed: input.uniqueProtocolsUsed ?? 0,
        balanceUsd: input.balanceUsd ?? 0,
        latestTxTimestamp: input.latestTxTimestamp ?? 0,
        volumeTraded: input.volumeTraded ?? 0,
        largestTx: input.largestTx ?? 0,
        totalRepaidLoans: creditHistory.totalRepaidLoans ?? 0,
        totalRepaidUsd: creditHistory.totalRepaidUsd ?? 0,
        hasActiveDefaults: creditHistory.hasActiveDefaults ?? false,
        lateRepaymentCount: creditHistory.lateRepaymentCount ?? 0,
        veCrdtBalance: creditHistory.veCrdtBalance ?? 0,
        gaugeVotesCount: creditHistory.gaugeVotesCount ?? 0,
        activeVestingUsd: input.activeVestingUsd ?? 0,
        vestingMonthlyInflowUsd: input.vestingMonthlyInflowUsd ?? 0,
      };

      const vcsResult = computeVcs(vcsInput);
      
      const localState: PassportSummary = {
        loading: false,
        score: input.gitcoinPassportScore ?? 0,
        stamps: Number(input.easAttestations?.length ?? 0),
        tierName: vcsResult.tierName,
        compositeScore: vcsResult.score,
        ias: vcsResult.breakdown.identity.earned,
        fbs: vcsResult.breakdown.creditHistory.earned + vcsResult.breakdown.activity.earned,
        walletAgeBaseScore: vcsResult.breakdown.activity.factors
          .find(f => f.label === 'Wallet age')?.earned ?? 0,
        realTier: vcsResult.realTier,
        multiplier: vcsResult.riskMultiplier,
        ltvBoostBps: vcsResult.ltvBoostBps,
        rateSurchargeOrDiscountBps: vcsResult.rateSurchargeOrDiscountBps,
        activityMetrics: {
          ageMonths: Math.floor((input.walletAgedays ?? 0) / 30),
          txCount: input.txCount ?? 0,
          totalVolume: input.volumeTraded ?? 0,
          currentBalance: input.balanceUsd ?? 0,
          athBalance: (input.balanceUsd ?? 0) * 1.5,
          latestTxTimestamp: input.latestTxTimestamp ?? 0,
          largestTx: input.largestTx ?? 0,
        },
        error: null
      };

      if (active) setPassportSummary(localState);

      // Sync with backend — use authoritative score if available
      try {
        const backendResult = await api.verifyIdentity(address);
        if (!active) return;
        const profile = backendResult?.profile;
        if (profile && profile.score) {
          setPassportSummary(prev => {
            return {
              ...prev,
              // Local authoritative: calculate in computeVcs() above takes precedence
              compositeScore: prev.compositeScore || profile.score,
              tierName: prev.tierName || profile.tierName,
              multiplier: prev.multiplier || profile.riskMultiplier,
              ltvBoostBps: prev.ltvBoostBps || profile.ltvBoostBps,
              rateSurchargeOrDiscountBps: prev.rateSurchargeOrDiscountBps || profile.rateSurchargeOrDiscountBps,
            };
          });
        }
      } catch {
        // Non-fatal — local score is already displayed
      }
    })
    .catch((err: Error) => {
      if (!active) return;
      setPassportSummary({
        loading: false,
        score: null,
        stamps: null,
        error: err instanceof Error ? err.message : 'Failed to fetch passport'
      });
    });

    return () => { active = false; };
  }, [address]);

  return passportSummary;
}
