export const LENDING_POOL_ABI = [
  { name: 'deposit',           type: 'function', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'depositType', type: 'uint8' }, { name: 'lockDays', type: 'uint256' }], outputs: [] },
  { name: 'withdraw',          type: 'function', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'positionId', type: 'uint256' }], outputs: [] },
  { name: 'totalDeposits',     type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'totalBorrowed',     type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'utilizationRateBps',type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'getVariableApyBps', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'availableLiquidity',type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'lenderPositions',   type: 'function', inputs: [{ name: 'user', type: 'address' }, { name: 'index', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'depositType', type: 'uint8' }, { name: 'startTime', type: 'uint256' }, { name: 'lockDays', type: 'uint256' }, { name: 'lockEndTime', type: 'uint256' }, { name: 'fixedApyBps', type: 'uint256' }, { name: 'isActive', type: 'bool' }] }], stateMutability: 'view' },
] as const;
