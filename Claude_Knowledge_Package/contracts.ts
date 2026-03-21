export const CONTRACT_ADDRESSES: Record<number, any> = {
  // Sepolia Testnet
  11155111: {
    ValuationEngine: "0xFE760633C40f7b2A3a571f54Ede74E9385012345",
    VestingAdapter: "0xAdA970633C40f7b2A3a571f54Ede74E938506789",
    VestraWrapperNFT: "0xNFT0633C40f7b2A3a571f54Ede74E93850abcdef",
    LoanManager: "0xLM760633C40f7b2A3a571f54Ede74E9385012345",
    LendingPool: "0xLP760633C40f7b2A3a571f54Ede74E9385012345",
    VestingRegistry: "0xReg60633C40f7b2A3a571f54Ede74E9385012345",
  },
  // Base Mainnet
  8453: {
    ValuationEngine: "0x...",
    VestingAdapter: "0x...",
    // ...
  },
  // ASI Chain
  192: {
    ValuationEngine: "0x...",
    // ...
  }
};

export const VALUATION_ENGINE_ABI = [
  "function computeDPV(uint256, address, uint256, address) view returns (uint256, uint256)",
  "function tokenOmegaBps(address) view returns (uint256)",
  "function updateOmega(address, uint256) external",
];

export const VESTING_ADAPTER_ABI = [
  "function escrow(uint256, address, address) external",
  "function getDetails(uint256) view returns (uint256, address, uint256)",
];
