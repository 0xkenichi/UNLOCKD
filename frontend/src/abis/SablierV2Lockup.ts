// Sablier v2 Lockup per-field getters (same signatures on Linear, Dynamic and Tranched v2.0 – v2.2).
// These are the getters VestingAdapter reads when escrowing a Sablier stream NFT.
export const SABLIER_V2_LOCKUP_ABI = [
  { name: 'getRecipient',       type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'getAsset',           type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'getStartTime',       type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint40' }], stateMutability: 'view' },
  { name: 'getEndTime',         type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint40' }], stateMutability: 'view' },
  { name: 'getDepositedAmount', type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint128' }], stateMutability: 'view' },
  { name: 'getWithdrawnAmount', type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint128' }], stateMutability: 'view' },
  { name: 'getRefundedAmount',  type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint128' }], stateMutability: 'view' },
  { name: 'isCancelable',       type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'wasCanceled',        type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
] as const;
