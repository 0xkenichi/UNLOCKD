// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
//
// ScannerContext — single global instance of useWalletScanner shared across all pages.
// Wrap <AppShell> with <ScannerProvider>; consume via useScanner() anywhere in the tree.

import { createContext, useContext, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { useOnchainSession, getActiveIdentity } from './onchainSession.js';
import useWalletScanner from './useWalletScanner.js';

const ScannerContext = createContext(null);

/**
 * ScannerProvider
 * Determines the active wallet address (EVM or Solana) and runs a single
 * shared useWalletScanner poll. All descendants can call useScanner().
 */
export function ScannerProvider({ children }) {
    const { address: evmAddress } = useAccount();
    const { publicKey: solPublicKey } = useWallet();
    const { session } = useOnchainSession();

    // Mirror the same address-resolution logic as Scanner.jsx
    const activeIdentity = getActiveIdentity(session, evmAddress);
    let primaryAddress = activeIdentity.walletAddress;

    if (session.primaryIdentity === 'solana' && solPublicKey) {
        primaryAddress = solPublicKey.toString();
    } else if (session.primaryIdentity === 'evm' && evmAddress) {
        primaryAddress = evmAddress;
    }

    // One shared poll — 60 s interval, chain=all so backend scans both EVM + Solana
    const scannerResult = useWalletScanner(primaryAddress || null, 'all', 60_000);

    const value = useMemo(() => ({
        ...scannerResult,
        primaryAddress: primaryAddress || null,
    }), [scannerResult, primaryAddress]);

    return (
        <ScannerContext.Provider value={value}>
            {children}
        </ScannerContext.Provider>
    );
}

/**
 * useScanner() — consume the global scanner feed on any page.
 *
 * Returns { loading, data, error, lastUpdated, refetch, primaryAddress }
 * where data = { summary, assets: { liquid, vested, defi }, linkedWallets }
 */
export function useScanner() {
    const ctx = useContext(ScannerContext);
    if (!ctx) {
        throw new Error('useScanner() must be used inside <ScannerProvider>');
    }
    return ctx;
}

export default ScannerContext;
