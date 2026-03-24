export const MOCK_SABLIER_ABI = [
  { name: 'createStream',      type: 'function', inputs: [{ name: 'recipient', type: 'address' }, { name: 'token', type: 'address' }, { name: 'totalAmount', type: 'uint256' }, { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'setOperator',       type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }, { name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] },
  { name: 'withdraw',          type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [] },
  { name: 'getStream',         type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }], stateMutability: 'view' },
  { name: 'vestedAmountOf',    type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'unvestedAmountOf',  type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'nextStreamId',      type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;
