// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { Connection, PublicKey } = require('@solana/web3.js');
const { getVestingAccounts } = require('@bonfida/token-vesting');

const BONFIDA_ENABLED = process.env.SOLANA_BONFIDA_ENABLED === 'true';
const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

const fetchBonfidaVesting = async (wallets = []) => {
    if (!BONFIDA_ENABLED || !wallets || wallets.length === 0) {
        return [];
    }

    const clusterUrl = process.env.SOLANA_RPC_URL || DEFAULT_SOLANA_RPC;
    const connection = new Connection(clusterUrl);

    const allVesting = [];

    for (const wallet of wallets) {
        try {
            const pubkey = new PublicKey(wallet);
            // Fetches all schedules where pubkey is the beneficiary
            const vestings = await getVestingAccounts(connection, pubkey);

            for (const vest of vestings) {
                // approximate Bonfida calculations
                const schedules = vest.schedules || [];
                // Extract cliff and general end bounds
                const start = schedules.length ? schedules[0].header.cliffTime.toNumber() : 0;
                const end = schedules.length ? schedules[schedules.length - 1].header.unlockTime.toNumber() : 0;

                let totalAmount = 0n;
                for (const s of schedules) {
                    totalAmount += BigInt(s.header.amount.toString() || '0');
                }

                const now = Math.floor(Date.now() / 1000);
                const daysToUnlock = end > now ? Math.max(0, Math.round((end * 1000 - Date.now()) / 86400000)) : null;

                allVesting.push({
                    loanId: `bonfida-${vest.seed.toString()}`,
                    borrower: wallet,
                    principal: '0',
                    interest: '0',
                    collateralId: vest.vestingAccountKey.toString(),
                    unlockTime: end,
                    active: end > now,
                    token: vest.mintAddress.toString(),
                    tokenSymbol: 'TOKEN', // Needs metadata resolution like pyth in streamflow.js
                    tokenDecimals: 6,
                    quantity: totalAmount.toString(),
                    pv: '0',
                    ltvBps: '0',
                    daysToUnlock,
                    chain: 'solana',
                    protocol: 'Bonfida',
                    timeline: {
                        start: start,
                        cliff: start,
                        end: end
                    },
                    evidence: {
                        escrowTx: '',
                        wallet: '',
                        token: ''
                    }
                });
            }
        } catch (error) {
            console.warn(`[solana] bonfida fetch failed for wallet ${wallet}`, error?.message || error);
        }
    }

    return allVesting;
};

module.exports = { fetchBonfidaVesting };
