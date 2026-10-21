'use client';

import { useReadContracts } from 'wagmi';
import { useContracts } from '@/hooks/useVestraContracts';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';

/** LoanManager.Status */
export const LOAN_STATUS = {
  NONE: 0,
  ACTIVE: 1,
  AUCTION: 2,
  REPAID: 3,
  LIQUIDATED: 4,
} as const;

export const LOAN_STATUS_LABELS: Record<number, string> = {
  0: 'NOT FOUND',
  1: 'ACTIVE',
  2: 'IN AUCTION',
  3: 'REPAID',
  4: 'LIQUIDATED',
};

export interface LoanStruct {
  borrower:    `0x${string}`;
  nftContract: `0x${string}`;
  streamId:    bigint;
  escrowId:    bigint;
  token:       `0x${string}`;
  quantity:    bigint;
  unlockTime:  bigint;
  principal:   bigint;
  scaledDebt:  bigint;
  openedAt:    bigint;
  maturity:    bigint;
  rank:        number;
  status:      number;
}

export interface AuctionState {
  startTime:  bigint;
  duration:   bigint;
  startPrice: bigint;
  floorPrice: bigint;
  debt:       bigint;
  principal:  bigint;
  claim:      bigint;
  mark:       bigint;
}

/** Reads a loan and its live debt / health / auction state from LoanManager. */
export function useLoanData(loanId: bigint | null) {
  const contracts = useContracts();
  const lm = { address: contracts.loanManager, abi: LOAN_MANAGER_ABI } as const;
  const id = loanId ?? 0n;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...lm, functionName: 'getLoan',         args: [id] },
      { ...lm, functionName: 'debtOf',          args: [id] },
      { ...lm, functionName: 'currentRateBps' },
      { ...lm, functionName: 'healthFactorBps', args: [id] },
      { ...lm, functionName: 'isLiquidatable',  args: [id] },
      { ...lm, functionName: 'auctions',        args: [id] },
      { ...lm, functionName: 'currentPrice',    args: [id] },
      { ...lm, functionName: 'gracePeriod' },
    ],
    query: { enabled: loanId !== null && loanId > 0n, refetchInterval: 15_000 },
  });

  const loan = data?.[0]?.status === 'success' ? (data[0].result as unknown as LoanStruct) : undefined;
  const a = data?.[5]?.status === 'success'
    ? (data[5].result as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint])
    : undefined;
  const auction: AuctionState | undefined = a && a[0] > 0n
    ? { startTime: a[0], duration: a[1], startPrice: a[2], floorPrice: a[3], debt: a[4], principal: a[5], claim: a[6], mark: a[7] }
    : undefined;

  return {
    isLoading,
    refetch,
    loan,
    status:          loan?.status ?? LOAN_STATUS.NONE,
    debt:            (data?.[1]?.result as bigint | undefined) ?? 0n,
    rateBps:         (data?.[2]?.result as bigint | undefined) ?? 0n,
    healthFactorBps: data?.[3]?.result as bigint | undefined,
    isLiquidatable:  Boolean(data?.[4]?.result),
    auction,
    currentPrice:    (data?.[6]?.result as bigint | undefined) ?? 0n,
    gracePeriod:     (data?.[7]?.result as bigint | undefined) ?? 0n,
  };
}
