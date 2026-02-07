import {
  arbitrum,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  hardhat,
  sepolia
} from 'viem/chains';

export const EVM_MAINNET_CHAINS = [base, arbitrum, avalanche];
export const EVM_TESTNET_CHAINS = [sepolia, baseSepolia, avalancheFuji, hardhat];
export const ALL_EVM_CHAINS = [...EVM_MAINNET_CHAINS, ...EVM_TESTNET_CHAINS];
export const DEFAULT_EVM_CHAIN = sepolia;

export const SOLANA_NETWORKS = [
  {
    id: 'mainnet-beta',
    name: 'Solana Mainnet',
    endpoint:
      import.meta.env.VITE_SOLANA_MAINNET_RPC ||
      'https://api.mainnet-beta.solana.com'
  },
  {
    id: 'devnet',
    name: 'Solana Devnet',
    endpoint:
      import.meta.env.VITE_SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com'
  }
];

export function getEvmChainById(chainId) {
  return ALL_EVM_CHAINS.find((chain) => chain.id === chainId);
}

export function getSolanaNetworkById(id) {
  return SOLANA_NETWORKS.find((network) => network.id === id);
}
