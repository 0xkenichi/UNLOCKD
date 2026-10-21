// Stream readers VestingAdapter uses for the non-Sablier protocols
// (packages/contracts/src/interfaces/IVestingProtocol.sol).

/** VestingAdapter.Protocol enum. */
export const VESTING_PROTOCOL = {
  SABLIER_V2: 0,
  STREAMFLOW_EVM: 1,
  GENERIC_ERC721: 2,
} as const;

export type VestingProtocolId = (typeof VESTING_PROTOCOL)[keyof typeof VESTING_PROTOCOL];

export const VESTING_PROTOCOL_LABELS: Record<VestingProtocolId, string> = {
  0: 'Sablier v2',
  1: 'Streamflow EVM',
  2: 'Generic ERC-721',
};

/** Protocol 1 — Streamflow EVM wrapper. */
export const STREAMFLOW_ABI = [
  {
    name: 'getStreamData', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'withdrawn', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
    ],
  },
] as const;

/** Protocol 2 — whitelisted generic ERC-721 vesting claim (IVestingProtocol). */
export const GENERIC_VESTING_ABI = [
  {
    name: 'getStream', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'withdrawnAmount', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
    ],
  },
] as const;
