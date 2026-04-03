export const VESTRA_CREDIT_REGISTRY_ABI = [
  { name: 'getRecord',        type: 'function', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ components: [{ name: 'score', type: 'uint16' }, { name: 'tier', type: 'uint8' }, { name: 'updatedAt', type: 'uint32' }, { name: 'ltvBoostBps', type: 'uint16' }, { name: 'rateAdjBps', type: 'int16' }, { name: 'maxBorrowCap', type: 'uint256' }, { name: 'omegaFloorBps', type: 'uint16' }], type: 'tuple' }], stateMutability: 'view' },
  { name: 'getScore',         type: 'function', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ type: 'uint16' }], stateMutability: 'view' },
  { name: 'getTier',          type: 'function', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { name: 'isStale',          type: 'function', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'requestRescore',   type: 'function', inputs: [], outputs: [], stateMutability: 'nonpayable' }
] as const;
