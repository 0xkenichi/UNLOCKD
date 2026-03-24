export const LOAN_MANAGER_ABI = [
  { name: 'originateLoan',     type: 'function', inputs: [{ name: 'streamContract', type: 'address' }, { name: 'streamId', type: 'uint256' }, { name: 'requestedUsdc', type: 'uint256' }], outputs: [{ name: 'loanId', type: 'uint256' }, { name: 'nftTokenId', type: 'uint256' }] },
  { name: 'repayLoan',         type: 'function', inputs: [{ name: 'loanId', type: 'uint256' }], outputs: [] },
  { name: 'settleLoan',        type: 'function', inputs: [{ name: 'loanId', type: 'uint256' }], outputs: [] },
  { name: 'vcsTier',           type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'maxCreditBps',      type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'loans',             type: 'function', inputs: [{ name: '', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'borrower', type: 'address' }, { name: 'streamContract', type: 'address' }, { name: 'streamId', type: 'uint256' }, { name: 'collateralToken', type: 'address' }, { name: 'borrowedUsdc', type: 'uint256' }, { name: 'dpvAtOrigination', type: 'uint256' }, { name: 'interestRateBps', type: 'uint256' }, { name: 'originatedAt', type: 'uint256' }, { name: 'dueAt', type: 'uint256' }, { name: 'nftTokenId', type: 'uint256' }, { name: 'active', type: 'bool' }] }], stateMutability: 'view' },
  { name: 'totalOwed',         type: 'function', inputs: [{ name: 'loanId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'getBorrowerLoans',  type: 'function', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ type: 'uint256[]' }], stateMutability: 'view' },
  { name: 'lendToClaim',       type: 'function', inputs: [{ name: 'collateralId', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'claimDefaultedLoan',type: 'function', inputs: [{ name: 'loanId', type: 'uint256' }], outputs: [] },
] as const;
