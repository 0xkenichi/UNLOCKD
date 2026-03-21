import { createConfig, http } from "wagmi";
import { 
  base, 
  baseSepolia, 
  sepolia, 
  mainnet, 
  arbitrum, 
  avalanche 
} from "wagmi/chains";
import { coinbaseWallet, injected, safe, walletConnect } from "wagmi/connectors";

// ─── USDC contract addresses per chain ──────────────────────────────────────
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [base.id]:        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet USDC
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
  [sepolia.id]:     "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Ethereum Sepolia USDC
};

// ─── Vesting / lock contract addresses ──────────────────────────────────────
// Add your actual vesting contract addresses here per chain
export const VESTING_CONTRACTS: Record<number, `0x${string}`[]> = {
  [base.id]:        [],
  [baseSepolia.id]: [],
  [sepolia.id]:     process.env.NEXT_VESTING_WALLET_ADDRESS_11155111 
                    ? [process.env.NEXT_VESTING_WALLET_ADDRESS_11155111 as `0x${string}`] 
                    : [],
};

// ─── Custom Chains ──────────────────────────────────────────────────────────
const flowEvm = {
  id: 747,
  name: 'Flow EVM',
  nativeCurrency: { name: 'Flow', symbol: 'FLOW', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet.evm.nodes.onflow.org'] },
  },
  blockExplorers: {
    default: { name: 'Flowscan', url: 'https://evm.flowscan.io' }
  }
} as const;

const asiTestnet = {
  id: 42000,
  name: 'ASI Testnet',
  nativeCurrency: { name: 'Artificial Superintelligence', symbol: 'ASI', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-testnet.asi.network'] },
  },
  blockExplorers: {
    default: { name: 'ASIScan', url: 'https://explorer-testnet.asi.network' }
  },
  testnet: true
} as const;

// ─── Wagmi config ────────────────────────────────────────────────────────────
export const config = createConfig({
  chains: [
    mainnet, 
    base, 
    sepolia, 
    baseSepolia, 
    arbitrum, 
    avalanche, 
    flowEvm, 
    asiTestnet
  ],
  connectors: [
    // Safe wallet MUST be first — it auto-detects when running inside Safe app
    safe({
      allowedDomains: [/gnosis-safe\.io$/, /app\.safe\.global$/],
      debug: process.env.NODE_ENV === "development",
    }),
    injected({ target: "metaMask" }),
    coinbaseWallet({ appName: "Vestra Protocol" }),
    walletConnect({
      projectId: process.env.NEXT_WC_PROJECT_ID ?? "",
    }),
  ],
  transports: {
    [mainnet.id]:     http(),
    [base.id]:        http(process.env.NEXT_PUBLIC_RPC_BASE        ?? "https://mainnet.base.org"),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA ?? "https://sepolia.base.org"),
    [sepolia.id]:     http(process.env.NEXT_PUBLIC_RPC_SEPOLIA      ?? "https://rpc.sepolia.org"),
    [arbitrum.id]:    http(),
    [avalanche.id]:   http(),
    [flowEvm.id]:     http(),
    [asiTestnet.id]:  http(),
  },
  // Polling interval — important for localhost to pick up balance changes quickly
  pollingInterval: 4_000,
});
