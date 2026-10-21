'use client';

import { useReadContracts } from 'wagmi';
import { SABLIER_V2_LOCKUP_ABI } from '@/abis/SablierV2Lockup';
import { STREAMFLOW_ABI, GENERIC_VESTING_ABI, VESTING_PROTOCOL, type VestingProtocolId } from '@/abis/VestingProtocols';

export interface StreamCollateral {
  token:      `0x${string}` | undefined;
  /** Tokens still locked: deposited − withdrawn (− refunded for Sablier), as VestingAdapter computes it. */
  quantity:   bigint;
  unlockTime: number;
  /** Sablier only: cancelable streams are rejected by VestingAdapter. */
  cancelable: boolean;
  canceled:   boolean;
  isLoading:  boolean;
  isError:    boolean;
}

/** Reads a vesting stream the same way VestingAdapter._readStream does, for previews before escrow. */
export function useStreamCollateral(
  protocol: VestingProtocolId,
  nftContract: `0x${string}` | undefined,
  streamId: bigint | null,
): StreamCollateral {
  const enabled = !!nftContract && streamId !== null;
  const id = streamId ?? 0n;
  const target = nftContract ?? '0x0000000000000000000000000000000000000000';
  const isSablier = protocol === VESTING_PROTOCOL.SABLIER_V2;

  const sablier = useReadContracts({
    contracts: [
      { address: target, abi: SABLIER_V2_LOCKUP_ABI, functionName: 'getAsset',           args: [id] },
      { address: target, abi: SABLIER_V2_LOCKUP_ABI, functionName: 'getDepositedAmount', args: [id] },
      { address: target, abi: SABLIER_V2_LOCKUP_ABI, functionName: 'getWithdrawnAmount', args: [id] },
      { address: target, abi: SABLIER_V2_LOCKUP_ABI, functionName: 'getRefundedAmount',  args: [id] },
      { address: target, abi: SABLIER_V2_LOCKUP_ABI, functionName: 'getEndTime',         args: [id] },
      { address: target, abi: SABLIER_V2_LOCKUP_ABI, functionName: 'isCancelable',       args: [id] },
      { address: target, abi: SABLIER_V2_LOCKUP_ABI, functionName: 'wasCanceled',        args: [id] },
    ],
    query: { enabled: enabled && isSablier },
  });

  const streamflow = useReadContracts({
    contracts: [{ address: target, abi: STREAMFLOW_ABI, functionName: 'getStreamData', args: [id] }],
    query: { enabled: enabled && protocol === VESTING_PROTOCOL.STREAMFLOW_EVM },
  });

  const generic = useReadContracts({
    contracts: [{ address: target, abi: GENERIC_VESTING_ABI, functionName: 'getStream', args: [id] }],
    query: { enabled: enabled && protocol === VESTING_PROTOCOL.GENERIC_ERC721 },
  });

  if (isSablier) {
    const r = sablier.data;
    const n = (i: number) => BigInt((r?.[i]?.result as bigint | number | undefined) ?? 0);
    const deposited = n(1);
    const spent = n(2) + n(3);
    return {
      token:      r?.[0]?.result as `0x${string}` | undefined,
      quantity:   deposited > spent ? deposited - spent : 0n,
      unlockTime: Number(n(4)),
      cancelable: Boolean(r?.[5]?.result),
      canceled:   Boolean(r?.[6]?.result),
      isLoading:  sablier.isLoading,
      isError:    !!r && r[0]?.status === 'failure',
    };
  }

  const q = protocol === VESTING_PROTOCOL.STREAMFLOW_EVM ? streamflow : generic;
  const res = q.data?.[0];
  const tuple = res?.status === 'success' ? (res.result as readonly [`0x${string}`, bigint, bigint, bigint]) : undefined;
  return {
    token:      tuple?.[0],
    quantity:   tuple ? (tuple[1] > tuple[2] ? tuple[1] - tuple[2] : 0n) : 0n,
    unlockTime: tuple ? Number(tuple[3]) : 0,
    cancelable: false,
    canceled:   false,
    isLoading:  q.isLoading,
    isError:    res?.status === 'failure',
  };
}
