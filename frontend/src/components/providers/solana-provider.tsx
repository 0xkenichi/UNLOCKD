'use client';

import React, { useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { 
    PhantomWalletAdapter,
    SolflareWalletAdapter,
    TorusWalletAdapter
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { Buffer } from 'buffer';

// Polyfill Buffer for the browser (required by @solana/web3.js)
if (typeof window !== 'undefined' && !window.Buffer) {
    window.Buffer = Buffer;
}

export const SolanaProvider = ({ children }: { children: React.ReactNode }) => {
    // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
    const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork) || WalletAdapterNetwork.Devnet;

    // Use custom Alchemy RPC if available, fallback to public clusterApiUrl
    const endpoint = useMemo(() => {
        if (network === WalletAdapterNetwork.Devnet && process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC) {
            return process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC;
        }
        if (network === WalletAdapterNetwork.Mainnet && process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC) {
            return process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC;
        }
        return clusterApiUrl(network);
    }, [network]);

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
            new TorusWalletAdapter(),
        ],
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
