import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com') },
  connectors: [
    injected(),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || '1de92ab623dbb7b3708a0d42b0f4fd85' }),
    coinbaseWallet({ appName: 'Vestra Protocol' }),
  ],
});
