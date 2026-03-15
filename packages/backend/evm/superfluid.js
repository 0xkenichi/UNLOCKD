// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { request, gql } = require('graphql-request');
// Pricing is handled downstream in the dDPV engine

// Superfluid Subgraph for Polygon (or change based on deployment chain)
const SUPERFLUID_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-polygon';
const SUPERFLUID_ENABLED = process.env.EVM_SUPERFLUID_ENABLED === 'true';

const fetchSuperfluidStreams = async (wallets = []) => {
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
      const flowRate = BigInt(stream.currentFlowRate || '0');

      const startTime = Number(stream.createdAtTimestamp || 0);
      const updatedAt = Number(stream.updatedAtTimestamp || 0);
      const streamedUntilUpdate = BigInt(stream.streamedUntilUpdatedAt || '0');

      // Calculate amount streamed since last update
      const timeDelta = BigInt(Math.max(0, now - updatedAt));
      const newlyStreamed = flowRate * timeDelta;
      const totalStreamed = streamedUntilUpdate + newlyStreamed;

      // Superfluid flows are continuous and do not have an inherent "end time" unless scheduled.
      // For Vestra's MVP we assume continuous perpetual streams act as liquid yielding assets 
      // where the "locked" amount is functionally unlimited, but we treat the "principal" 
      // as the 1-year yield for valuation purposes.
      const oneYearSeconds = BigInt(365 * 24 * 60 * 60);
      const expectedOneYearYield = flowRate * oneYearSeconds;

      let tokenSymbol = stream.token.symbol || 'SUP';
      let tokenDecimals = Number(stream.token.decimals || 18);
      let pv = '0'; // True PV depends on oracle downstream

      return {
        loanId: `superfluid-${stream.id}`,
        borrower: stream.receiver,
        principal: '0',
        interest: '0',
        collateralId: stream.id,
        unlockTime: now + 86400 * 365, // Arbitrary 1-year horizon
        active: true,
        token: stream.token.id,
        tokenSymbol,
        tokenDecimals,
        quantity: expectedOneYearYield.toString(),
        pv,
        ltvBps: '0',
        daysToUnlock: 365,
        chain: 'evm',
        protocol: 'Superfluid',
        timeline: {
          start: startTime,
          cliff: startTime,
          end: now + 86400 * 365 // Rolling 1-year continuous
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
    console.warn('[evm] superfluid search failed', error?.message || error);
    return [];
  }
};

module.exports = { fetchSuperfluidStreams };
