export const ISOLATED_LENDING_POOL_ABI = [
  { "type": "function", "name": "deposit",         "inputs": [{ "name": "assets", "type": "uint256" }, { "name": "receiver", "type": "address" }], "outputs": [{ "name": "shares", "type": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "withdraw",        "inputs": [{ "name": "assets", "type": "uint256" }, { "name": "receiver", "type": "address" }, { "name": "owner", "type": "address" }], "outputs": [{ "name": "shares", "type": "uint256" }], "stateMutability": "nonpayable" },
  { "type": "function", "name": "totalAssets",     "inputs": [], "outputs": [{ "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "totalBorrowed",   "inputs": [], "outputs": [{ "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "liquidAssets",    "inputs": [], "outputs": [{ "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "getInterestRateBps","inputs": [{ "name": "duration", "type": "uint256" }], "outputs": [{ "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "balanceOf",       "inputs": [{ "name": "account", "type": "address" }], "outputs": [{ "type": "uint256" }], "stateMutability": "view" },
  { "type": "function", "name": "convertToAssets", "inputs": [{ "name": "shares", "type": "uint256" }], "outputs": [{ "type": "uint256" }], "stateMutability": "view" }
] as const;
