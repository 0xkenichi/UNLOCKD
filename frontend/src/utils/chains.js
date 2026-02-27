import {
  arbitrum,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  hardhat,
  sepolia
} from 'viem/chains';

// Flow EVM networks (https://developers.flow.com/evm/networks)
const DEFAULT_FLOW_EVM_MAINNET_RPC = 'https://mainnet.evm.nodes.onflow.org';
const DEFAULT_FLOW_EVM_TESTNET_RPC = 'https://testnet.evm.nodes.onflow.org';

function readEvmRpcOverride(chainId, fallback) {
  const key = `VITE_EVM_RPC_${chainId}`;
  const value = import.meta.env?.[key];
  return value || fallback;
}

export const flowEvm = {
  id: 747,
  name: 'Flow EVM',
  network: 'flow-evm',
  testnet: false,
  nativeCurrency: { name: 'Flow', symbol: 'FLOW', decimals: 18 },
  rpcUrls: {
    default: { http: [readEvmRpcOverride(747, DEFAULT_FLOW_EVM_MAINNET_RPC)] },
    public: { http: [readEvmRpcOverride(747, DEFAULT_FLOW_EVM_MAINNET_RPC)] }
  },
  blockExplorers: {
    default: { name: 'Flowscan', url: 'https://evm.flowscan.io' }
  }
};

export const flowEvmTestnet = {
  id: 545,
  name: 'Flow EVM Testnet',
  network: 'flow-evm-testnet',
  testnet: true,
  nativeCurrency: { name: 'Flow', symbol: 'FLOW', decimals: 18 },
  rpcUrls: {
    default: { http: [readEvmRpcOverride(545, DEFAULT_FLOW_EVM_TESTNET_RPC)] },
    public: { http: [readEvmRpcOverride(545, DEFAULT_FLOW_EVM_TESTNET_RPC)] }
  },
  blockExplorers: {
    default: { name: 'Flowscan (Testnet)', url: 'https://evm-testnet.flowscan.io' }
  }
};

export const EVM_MAINNET_CHAINS = [base, arbitrum, avalanche, flowEvm];
export const EVM_TESTNET_CHAINS = [sepolia, baseSepolia, avalancheFuji, flowEvmTestnet, hardhat];
export const ALL_EVM_CHAINS = [...EVM_MAINNET_CHAINS, ...EVM_TESTNET_CHAINS];
const envDefaultChainId = Number(import.meta.env.VITE_DEFAULT_EVM_CHAIN_ID || '');
const defaultChainId = Number.isFinite(envDefaultChainId) ? envDefaultChainId : sepolia.id;
export const DEFAULT_EVM_CHAIN = ALL_EVM_CHAINS.find((chain) => chain.id === defaultChainId) || sepolia;

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
