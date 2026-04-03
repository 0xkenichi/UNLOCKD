export const SABLIER_V2_LOCKUP_ABI = [
  { name: 'getRecipient',      type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'getAsset',          type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { name: 'getStartTime',      type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint40' }], stateMutability: 'view' },
  { name: 'getEndTime',        type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint40' }], stateMutability: 'view' },
  { name: 'getDepositedAmount', type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint128' }], stateMutability: 'view' },
  { name: 'withdraw',          type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint128' }], outputs: [] },
  { name: 'setApproved',       type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }, { name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] },
  { name: 'isApproved',        type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }, { name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }
] as const;
