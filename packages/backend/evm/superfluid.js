// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');
const { createPublicClient, http, parseAbi } = require('viem');
const { mainnet, base } = require('viem/chains');

// SUPERFLUID PROTOCOL CONSTANTS
const CFAV1_FORWARDER_ADDRESS = '0xcfA132E353cB4E398080B9700609bb008eceB125';
const GDAV1_FORWARDER_ADDRESS = '0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08';

const CFAV1_FORWARDER_ABI = parseAbi([
  'function getFlowInfo(address token, address sender, address receiver) view returns (uint256 lastUpdated, int96 flowrate, uint256 deposit, uint256 owedDeposit)',
  'function getAccountFlowrate(address token, address account) view returns (int96 flowrate)'
]);

const GDAV1_FORWARDER_ABI = parseAbi([
  'function getPoolAdjustmentFlowRate(address pool, address member) view returns (int96 flowRate)'
]);

// Superfluid Subgraph for Polygon (or change based on deployment chain)
const THEGRAPH_API_KEY = process.env.THEGRAPH_API_KEY || '';
const SUPERFLUID_SUBGRAPH_URL = `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/5xS8X9B9Y6pQ8X9B9Y6pQ8X9B9Y6pQ`;
const SUPERFLUID_ENABLED = process.env.EVM_SUPERFLUID_ENABLED === 'true';
const DEMO_MODE = process.env.DEMO_MODE === 'true';

const fetchSuperfluidStreams = async (wallets = [], client = null) => {
  if (!SUPERFLUID_ENABLED || !wallets || wallets.length === 0) {
    return [];
  }

  const normalizedWallets = wallets.map(w => w.toLowerCase());

  const query = gql`
    query GetFlows($receivers: [String!]) {
      streams(where: { receiver_in: $receivers, currentFlowRate_gt: "0" }, first: 50, orderBy: createdAtTimestamp, orderDirection: desc) {
        id
        token {
          id
          symbol
          decimals
        }
        sender
        receiver
        currentFlowRate
        streamedUntilUpdatedAt
        createdAtTimestamp
        updatedAtTimestamp
      }
    }
  `;

  try {
    const data = await request(SUPERFLUID_SUBGRAPH_URL, query, { receivers: normalizedWallets });
    if (!data || !data.streams) return [];

    const now = Math.floor(Date.now() / 1000);

    const streams = await Promise.all(data.streams.map(async (stream) => {
      let flowRate = BigInt(stream.currentFlowRate || '0');
      
      // REAL-TIME VALIDATION via CFAv1Forwarder
      if (client) {
        try {
          const flowInfo = await client.readContract({
            address: CFAV1_FORWARDER_ADDRESS,
            abi: CFAV1_FORWARDER_ABI,
            functionName: 'getFlowInfo',
            args: [stream.token.id, stream.sender, stream.receiver]
          });
          flowRate = BigInt(flowInfo[1]); // flowrate is index 1
        } catch (err) {
          console.warn(`[Superfluid] CFA validation failed for ${stream.token.symbol}: ${err.message}`);
        }
      }

      if (flowRate === 0n) return null; // Stream might have closed since subgraph update

      const startTime = Number(stream.createdAtTimestamp || 0);
      const updatedAt = Number(stream.updatedAtTimestamp || 0);
      const streamedUntilUpdate = BigInt(stream.streamedUntilUpdatedAt || '0');

      const timeDelta = BigInt(Math.max(0, now - updatedAt));
      const newlyStreamed = flowRate * timeDelta;
      const totalStreamed = streamedUntilUpdate + newlyStreamed;

      const oneYearSeconds = BigInt(365 * 24 * 60 * 60);
      const expectedOneYearYield = flowRate * oneYearSeconds;

      let tokenSymbol = stream.token.symbol || 'SUP';
      let tokenDecimals = Number(stream.token.decimals || 18);

      return {
        loanId: `superfluid-${stream.id}`,
        borrower: stream.receiver,
        principal: '0',
        interest: '0',
        collateralId: stream.id,
        unlockTime: now + 86400 * 365,
        active: true,
        token: stream.token.id,
        tokenSymbol,
        tokenDecimals,
        quantity: expectedOneYearYield.toString(),
        ratePerSecond: flowRate.toString(), // CRITICAL: Added for monthlyInflowUsd calculation
        pv: '0',
        ltvBps: '0',
        daysToUnlock: 365,
        chain: 'evm',
        protocol: 'Superfluid',
        timeline: {
          start: startTime,
          cliff: startTime,
          end: now + 86400 * 365
        },
        evidence: {
          escrowTx: '',
          wallet: '',
          token: stream.token.id
        }
      };
    }));

    // DISCOVER POOLS (GDA)
    const pools = await fetchSuperfluidPools(normalizedWallets, client);
    
    return [...streams.filter(Boolean), ...pools];
  } catch (error) {
    if (!DEMO_MODE) {
      console.warn('[evm] superfluid search failed', error?.message || error);
    }
    return [];
  }
};

/**
 * Fetch Distribution Pools (GDA) for a user
 */
const fetchSuperfluidPools = async (receivers = [], client = null) => {
    // Discovery for pools is done via GDA subgraph or common emitters
    // For MVP we query the GDA subgraph if active
    const GDA_QUERY = gql`
      query GetPools($members: [String!]) {
        poolMembers(where: { account_in: $members, units_gt: "0" }) {
          id
          pool {
            id
            token {
              id
              symbol
              decimals
            }
          }
          account {
            id
          }
          units
          createdAtTimestamp
        }
      }
    `;

    try {
        const data = await request(SUPERFLUID_SUBGRAPH_URL, GDA_QUERY, { members: receivers });
        if (!data || !data.poolMembers) return [];

        const now = Math.floor(Date.now() / 1000);
        
        const pools = await Promise.all(data.poolMembers.map(async (member) => {
            let flowRate = 0n;

            // VALIDATE POOL INCOME via GDAv1Forwarder
            if (client) {
                try {
                    flowRate = BigInt(await client.readContract({
                        address: GDAV1_FORWARDER_ADDRESS,
                        abi: GDAV1_FORWARDER_ABI,
                        functionName: 'getPoolAdjustmentFlowRate',
                        args: [member.pool.id, member.account.id]
                    }));
                } catch (err) {
                   // Fallback: GDA flow rates are aggregate of all pool distributors
                   // If contract call fails, we might need a more complex calculation
                }
            }

            // Simplified: If flowrate is 0 or negative, we skip it for credit scoring unless it's a fixed distribution
            if (flowRate <= 0n) return null;

            const oneYearSeconds = BigInt(365 * 24 * 60 * 60);
            const expectedOneYearYield = flowRate * oneYearSeconds;

            return {
                id: `sf-pool-${member.id}`,
                loanId: `sf-pool-${member.id}`,
                borrower: member.account.id,
                protocol: 'Superfluid GDA',
                token: member.pool.token.id,
                tokenSymbol: member.pool.token.symbol,
                tokenDecimals: Number(member.pool.token.decimals || 18),
                quantity: expectedOneYearYield.toString(),
                ratePerSecond: flowRate.toString(),
                active: true,
                chain: 'evm',
                unlockTime: now + 86400 * 365,
                timeline: {
                    start: Number(member.createdAtTimestamp),
                    end: now + 86400 * 365
                }
            };
        }));

        return pools.filter(Boolean);
    } catch (err) {
        return [];
    }
};

module.exports = { fetchSuperfluidStreams, fetchSuperfluidPools };
