// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');
const { scanVestingLogs } = require('../lib/discovery_utils');

// Hedgey TokenVestingPlans Addresses (Common across many chains)
const HEDGEY_PLAN_ADDRESS = '0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C';

// Hedgey Subgraph Mapping (If available, otherwise we use direct contract calls)
// For now, let's use a common subgraph if found or fallback to direct calls in the service
const HEDGEY_SUBGRAPHS = {
    1: 'https://api.thegraph.com/subgraphs/name/hedgey-finance/hedgey-vesting-mainnet',
    10: 'https://api.thegraph.com/subgraphs/name/hedgey-finance/hedgey-vesting-optimism',
    137: 'https://api.thegraph.com/subgraphs/name/hedgey-finance/hedgey-vesting-polygon',
    42161: 'https://api.thegraph.com/subgraphs/name/hedgey-finance/hedgey-vesting-arbitrum'
};

const VESTING_QUERY = gql`
  query GetVestingPlans($recipient: Bytes!) {
    vestingPlans(where: { recipient: $recipient }) {
      id
      token { id symbol decimals }
      amount
      start
      cliff
      end
      rate
    }
  }
`;

/**
 * Fetch Hedgey Vesting Plans for a wallet
 * Note: If subgraph fails, we fallback to sniffing or specific factory scans
 */
const fetchHedgeyPlans = async (wallet, chainId = 1, client = null) => {
    const subgraphUrl = HEDGEY_SUBGRAPHS[chainId];
    let plans = [];

    if (subgraphUrl) {
        try {
            const res = await request(subgraphUrl, VESTING_QUERY, { recipient: wallet.toLowerCase() });
            plans = (res.vestingPlans || []).map(plan => {
                const amount = BigInt(plan.amount || '0');
                const end = Number(plan.end || 0);
                const now = Math.floor(Date.now() / 1000);

                return {
                    loanId: `hedgey-${plan.id}`,
                    borrower: wallet,
                    collateralId: plan.id,
                    unlockTime: end,
                    active: end > now && amount > 0n,
                    token: plan.token.id,
                    tokenSymbol: plan.token.symbol || 'HDG',
                    tokenDecimals: Number(plan.token.decimals || 18),
                    quantity: amount.toString(),
                    chain: 'evm',
                    chainId,
                    protocol: 'Hedgey Finance',
                    timeline: {
                        start: Number(plan.start || 0),
                        cliff: Number(plan.cliff || 0),
                        end: end
                    }
                };
            });
        } catch (err) {
            console.warn(`[Hedgey] Subgraph discovery failed on chain ${chainId}:`, err.message);
        }
    }

    // Fallback: Scan Logs if client provided
    if (plans.length === 0 && client) {
        console.log(`[Hedgey] Falling back to log scanning for ${wallet} on chain ${chainId}`);
        try {
            const logs = await scanVestingLogs(client, wallet);
            const hedgeyLogs = logs.filter(l => l.protocol === 'Hedgey Finance');
            
            plans = hedgeyLogs.map(log => ({
                loanId: `hedgey-log-${log.id}`,
                borrower: wallet,
                collateralId: log.id,
                unlockTime: log.end,
                active: log.end > Math.floor(Date.now() / 1000),
                token: log.token,
                tokenSymbol: 'UNKNOWN', // Would need token info fetcher
                tokenDecimals: 18,
                quantity: log.amount,
                chain: 'evm',
                chainId,
                protocol: 'Hedgey Finance (Scanned)',
                timeline: {
                    start: log.start,
                    cliff: log.cliff,
                    end: log.end
                }
            }));
        } catch (err) {
            console.warn(`[Hedgey] Log scanning failed on chain ${chainId}:`, err.message);
        }
    }

    return plans;
};

module.exports = { fetchHedgeyPlans, HEDGEY_PLAN_ADDRESS };
