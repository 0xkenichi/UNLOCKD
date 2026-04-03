// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');

const THEGRAPH_API_KEY = process.env.THEGRAPH_API_KEY || '';

const LLAMAPAY_SUBGRAPHS = {
    1: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/LlamaPay-Mainnet`,
    10: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/LlamaPay-Optimism`,
    137: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/LlamaPay-Polygon`,
    42161: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/LlamaPay-Arbitrum`,
    8453: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/LlamaPay-Base`
};

const STREAMS_QUERY = gql`
  query GetStreams($recipient: Bytes!) {
    streams(where: { recipient: $recipient, active: true }) {
      id
      payer { id }
      token { id symbol decimals }
      amountPerMonth
      createdTimestamp
    }
  }
`;

/**
 * Fetch LlamaPay streams for a wallet
 */
const fetchLlamaPayStreams = async (wallet, chainId = 1) => {
    const subgraphUrl = LLAMAPAY_SUBGRAPHS[chainId];
    if (!subgraphUrl) return [];

    try {
        const res = await request(subgraphUrl, STREAMS_QUERY, { recipient: wallet.toLowerCase() });
        return (res.streams || []).map(stream => {
            return {
                loanId: `llamapay-${stream.id}`,
                borrower: wallet,
                collateralId: stream.id,
                unlockTime: 0, // Continuous stream
                active: true,
                token: stream.token.id,
                tokenSymbol: stream.token.symbol || 'LAMA',
                tokenDecimals: Number(stream.token.decimals || 18),
                quantity: '0', // No "locked" amount in LlamaPay (pay-as-you-go)
                monthlyInflowUsd: 0, // Will be calculated by oracle with price
                ratePerMonth: stream.amountPerMonth,
                chain: 'evm',
                chainId,
                protocol: 'LlamaPay',
                timeline: {
                    start: Number(stream.createdTimestamp || 0),
                    end: 0
                }
            };
        });
    } catch (err) {
        console.warn(`[LlamaPay] Subgraph fetch failed on chain ${chainId}:`, err.message);
        return [];
    }
};

module.exports = { fetchLlamaPayStreams };
