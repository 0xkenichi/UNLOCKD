export const VESTRA_PROTOCOL_ABI = [
  // --- Loan Manager Router / State ---
  {
    "inputs": [],
    "name": "loanCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "loans",
    "outputs": [
      { "internalType": "address", "name": "borrower", "type": "address" },
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "principal", "type": "uint256" },
      { "internalType": "uint256", "name": "interest", "type": "uint256" },
      { "internalType": "uint256", "name": "collateralId", "type": "uint256" },
      { "internalType": "uint256", "name": "collateralAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "loanDuration", "type": "uint256" },
      { "internalType": "uint256", "name": "unlockTime", "type": "uint256" },
      { "internalType": "uint256", "name": "hedgeAmount", "type": "uint256" },
      { "internalType": "bool", "name": "active", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },

  // --- Loan Origination Facet ---
  {
    "inputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "collateralId", "type": "uint256" },
          { "internalType": "address", "name": "vestingContract", "type": "address" },
          { "internalType": "uint256", "name": "borrowAmount", "type": "uint256" },
          { "internalType": "uint256", "name": "durationDays", "type": "uint256" },
          { "internalType": "string", "name": "tokenURI", "type": "string" }
        ],
        "internalType": "struct LoanOriginationFacet.LoanParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "createLoan",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "identityLinked",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "identityBoostBps",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },

  // --- Valuation Engine ---
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
  },

  // --- Events ---
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "loanId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "borrower", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "LoanCreated",
    "type": "event"
  }
] as const;
