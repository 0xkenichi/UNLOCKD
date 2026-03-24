export const VALUATION_ENGINE_ABI = [
  { name: 'computeDPV', type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }, { name: 'token', type: 'address' }, { name: 'unlockTime', type: 'uint256' }, { name: 'streamContract', type: 'address' }], outputs: [{ name: 'dpv', type: 'uint256' }, { name: 'ltvBps', type: 'uint256' }], stateMutability: 'view' },
  { name: 'getTWAP',    type: 'function', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: 'price', type: 'uint256' }], stateMutability: 'view' },
] as const;
