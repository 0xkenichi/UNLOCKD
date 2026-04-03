export const LOAN_MANAGER_ABI = [
  { "type": "function", "name": "borrow",           "inputs": [{ "name": "collateralId", "type": "uint256" }, { "name": "vestingContract", "type": "address" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "lendToClaim",       "inputs": [{ "name": "collateralId", "type": "uint256" }, { "name": "amount", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "repay",             "inputs": [{ "name": "tokenId", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "repayPartial",      "inputs": [{ "name": "tokenId", "type": "uint256" }, { "name": "amount", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "keeperRepay",       "inputs": [{ "name": "tokenId", "type": "uint256" }, { "name": "amount", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "settleWithAsset",   "inputs": [{ "name": "tokenId", "type": "uint256" }, { "name": "asset", "type": "address" }, { "name": "amount", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "authorizeVestraPay","inputs": [{ "name": "tokenId", "type": "uint256" }, { "name": "status", "type": "bool" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "quoteRepayment",    "inputs": [{ "name": "tokenId", "type": "uint256" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "liquidate",         "inputs": [{ "name": "tokenId", "type": "uint256" }], "outputs": [], "stateMutability": "nonpayable" },
  { "type": "function", "name": "loans",             "inputs": [{ "name": "tokenId", "type": "uint256" }], "outputs": [
    {
      "name": "",
      "type": "tuple",
      "components": [
        { "name": "borrower", "type": "address" },
        { "name": "collateralId", "type": "uint256" },
        { "name": "principal", "type": "uint256" },
        { "name": "interestRate", "type": "uint256" },
        { "name": "startTime", "type": "uint256" },
        { "name": "unlockTime", "type": "uint256" },
        { "name": "active", "type": "bool" },
        { "name": "vestraPayEnabled", "type": "bool" },
        { "name": "lender", "type": "address" }
      ]
    }
  ], "stateMutability": "view" }
] as const;
