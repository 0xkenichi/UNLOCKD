'use client';

import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { motion } from 'framer-motion';

export const SolanaConnectButton = () => {
    const { wallet, disconnect, publicKey } = useWallet();

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center"
        >
            <WalletMultiButton className="bg-white/5 hover:bg-white/10 border border-white/10 !h-10 !px-4 !py-2 rounded-xl !text-sm !font-bold transition-all !font-sans" />
        </motion.div>
    );
};
