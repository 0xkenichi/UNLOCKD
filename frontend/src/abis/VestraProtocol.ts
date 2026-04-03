export const VESTRA_PROTOCOL_ABI = [
  // --- State ---
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "loans",
    "outputs": [
      { "internalType": "address", "name": "borrower", "type": "address" },
      { "internalType": "uint256", "name": "collateralId", "type": "uint256" },
      { "internalType": "uint256", "name": "principal", "type": "uint256" },
      { "internalType": "uint256", "name": "interestRate", "type": "uint256" },
      { "internalType": "uint256", "name": "startTime", "type": "uint256" },
      { "internalType": "uint256", "name": "unlockTime", "type": "uint256" },
      { "internalType": "bool", "name": "active", "type": "bool" },
      { "internalType": "bool", "name": "vestraPayEnabled", "type": "bool" },
      { "internalType": "address", "name": "lender", "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  // --- Borrow ---
  {
    "inputs": [
      { "internalType": "uint256", "name": "collateralId", "type": "uint256" },
      { "internalType": "address", "name": "vestingContract", "type": "address" }
    ],
    "name": "borrow",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "collateralId", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "lendToClaim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // --- Repay ---
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "repay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "repayPartial",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "address", "name": "asset", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "settleWithAsset",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "bool", "name": "status", "type": "bool" }
    ],
    "name": "authorizeVestraPay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // --- Views ---
  {
    "inputs": [{ "internalType": "uint256", "name": "tokenId", "type": "uint256" }],
    "name": "quoteRepayment",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "quantity", "type": "uint256" },
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "unlockTime", "type": "uint256" },
      { "internalType": "address", "name": "vestingContract", "type": "address" }
    ],
    "name": "computeDPV",
    "outputs": [
      { "internalType": "uint256", "name": "pv", "type": "uint256" },
      { "internalType": "uint256", "name": "ltvBps", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
