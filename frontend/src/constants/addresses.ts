export const VESTRA_TREASURY = '0x795937E67da6F4F877D0cbD103F535D589636387';

export interface ChainConfig {
  aavePool: string;
  usdc: string;
  aUsdc: string;
}

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    aavePool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    aUsdc: '0x98C23E9d8f34FEFb1B7Dd6a91B79fc4402636477',
  },
  // Base
  8453: {
    aavePool: '0xA238Dd80C259a72e81d7e4664a180A5932d0E355',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    aUsdc: '0x4e65fE4DbA92790696d040ac24Ba23eE0B22306e',
  },
  // Arbitrum
  42161: {
    aavePool: '0x794a61358D084d5c4850aA8b965f3a0937a400E7',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    aUsdc: '0x724dcDf034155C1838944ec701741791BC5833EE',
  },
  // Sepolia (Testnet)
  11155111: {
    aavePool: '0x6Ae43d3271ff68486466587c724219Fa2191c959',
    usdc: '0x94a9D9AC8a22534E3FaCa9F4e742328271421230',
    aUsdc: '0x16dA45517174C37b678B3F40E2904FeE6A525547',
  }
};

export const getChainConfig = (chainId: number | undefined): ChainConfig | undefined => {
  if (!chainId) return undefined;
  return CHAIN_CONFIGS[chainId];
};
