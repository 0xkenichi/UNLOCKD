// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');
// Pricing is handled downstream in the dDPV engine

// Sablier V2 Subgraph for Sepolia (or replace with mainnet as needed)
const SABLIER_SUBGRAPH_URL = 'https://gateway.thegraph.com/api/deploy-key/subgraphs/id/CsDNYv8qL6m8CZZbrx8X9B9Y6pQ';

const SABLIER_ENABLED = process.env.EVM_SABLIER_ENABLED === 'true';

const fetchSablierStreams = async (wallets = []) => {
    if (!SABLIER_ENABLED) {
        return [];
    }

    const normalizedWallets = wallets.map(w => w.toLowerCase());
    const hasWallets = normalizedWallets.length > 0;

    const query = gql`
    query GetStreams($recipients: [Bytes!], $hasWallets: Boolean!) {
      streams(where: { 
        OR: [
          { recipient_in: $recipients },
          { recipient_not: "0x0000000000000000000000000000000000000000" } 
        ]
        status_not: "DEPLETED" 
      }, first: 50, orderBy: createdAtTimestamp, orderDirection: desc) {
        id
        contract
        recipient
        asset {
          id
          symbol
          decimals
        }
        depositedAmount
        withdrawnAmount
        cliffTime
        endTime
        isCancelable
      }
    }
  `;

    try {
        const data = await request(SABLIER_SUBGRAPH_URL, query, { 
            recipients: normalizedWallets,
            hasWallets
        });
        if (!data || !data.streams) return [];

        const now = Math.floor(Date.now() / 1000);

        const streams = await Promise.all(data.streams.map(async (stream) => {
            // Basic Sablier Lockup Linear calculation approximation from subgraph
            const deposited = BigInt(stream.depositedAmount || '0');
            const withdrawn = BigInt(stream.withdrawnAmount || '0');

            const endTime = Number(stream.endTime || 0);
            const cliffTime = Number(stream.cliffTime || 0);

            // If we are before the cliff, everything is locked.
            // We don't have the exact streamedAmountOf via subgraph instantly without RPC calls, 
            // but for portfolio dashboarding we can approximate the locked vs vested based on time.
            const locked = deposited - withdrawn; // The total remaining in the contract

            let tokenSymbol = stream.asset.symbol || 'SAB';
            let tokenDecimals = Number(stream.asset.decimals || 18);

            let pv = '0'; // PV is calculated by the dDPV engine downstream

            const active = endTime > now && locked > 0n;
            const daysToUnlock = endTime > now ? Math.max(0, Math.round((endTime * 1000 - Date.now()) / 86400000)) : null;

            return {
                loanId: `sablier-${stream.id}`,
                borrower: stream.recipient,
                principal: '0',
                interest: '0',
                collateralId: stream.id,
                unlockTime: endTime,
                active,
                token: stream.asset.id,
                tokenSymbol,
                tokenDecimals,
                quantity: locked.toString(),
                pv,
                ltvBps: '0',
                daysToUnlock,
                chain: 'evm',
                protocol: 'Sablier',
                timeline: {
                    cliff: cliffTime,
                    start: cliffTime, // Simplified
                    end: endTime
                },
                evidence: {
                    escrowTx: '',
                    wallet: '',
                    token: ''
                }
            };
        }));

        return streams.filter(Boolean);
    } catch (error) {
        console.warn('[evm] sablier search failed', error?.message || error);
        return [];
    }
};

module.exports = { fetchSablierStreams };
