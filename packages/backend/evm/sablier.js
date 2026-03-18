const { request, gql } = require('graphql-request');

const THEGRAPH_API_KEY = process.env.THEGRAPH_API_KEY || '';

// Sablier V2 Subgraph Mapping (Separate Lockup and Flow)
const SABLIER_SUBGRAPHS = {
    1: { // Mainnet
        lockup: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/AvDAMYYHGaEwn9F9585uqq6MM5CfvRtYcb7KjK7LKPCt`,
        flow: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/ECxBJhKceBGaVvK6vqmK3VQAncKwPeAQutEb8TeiUiod`
    },
    10: { // Optimism
        lockup: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/NZHzd2JNFKhHP5EWUiDxa5TaxGCFbSD4g6YnYr8JGi6`,
        flow: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/AygPgsehNGSB4K7DYYtvBPhTpEiU4dCu3nt95bh9FhRf`
    },
    8453: { // Base
        lockup: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/778GfecD9tsyB4xNnz4wfuAyfHU6rqGr79VCPZKu3t2F`,
        flow: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/4XSxXh8ZgkzaA35nrbQG9Ry3FYz3ZFD8QBdWwVg5pF9W`
    },
    11155111: { // Sepolia
        lockup: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/5yDtFSxyRuqyjvGJyyuQhMEW3Uah7Ddy2KFSKVhy9VMa`,
        flow: `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/EU9AWmJjrjMRkjxcdHfuWPZvPTNAL3hiXfNGN5MwUpvm`
    }
};

const SABLIER_ENABLED = process.env.EVM_SABLIER_ENABLED === 'true';

const LOCKUP_QUERY = gql`
  query GetLockupPositions($recipients: [Bytes!]) {
    streams(where: { 
      recipient_in: $recipients,
      status_not: "DEPLETED" 
    }, first: 50, orderBy: createdAtTimestamp, orderDirection: desc) {
      id
      contract
      recipient
      asset { id symbol decimals }
      depositedAmount
      withdrawnAmount
      cliffTime
      endTime
    }
  }
`;

const FLOW_QUERY = gql`
  query GetFlowPositions($recipients: [Bytes!]) {
    flows(where: {
      recipient_in: $recipients,
      status_not: "VOIDED"
    }, first: 50, orderBy: createdAtTimestamp, orderDirection: desc) {
      id
      contract
      recipient
      asset { id symbol decimals }
      ratePerSecond
      accumulatedAmount
      withdrawnAmount
    }
  }
`;

const fetchSablierStreams = async (wallets = [], chainId = 11155111) => {
    if (!SABLIER_ENABLED || !wallets.length) {
        return [];
    }

    const config = SABLIER_SUBGRAPHS[chainId] || SABLIER_SUBGRAPHS[11155111];
    const recipients = wallets.map(w => w.toLowerCase());
    const now = Math.floor(Date.now() / 1000);

    let lockupRes = { streams: [] };
    let flowRes = { flows: [] };

    try {
        [lockupRes, flowRes] = await Promise.all([
            request(config.lockup, LOCKUP_QUERY, { recipients }),
            request(config.flow, FLOW_QUERY, { recipients })
        ]);
    } catch (error) {
        console.error(`[sablier] subgraph fetch error on chain ${chainId}:`, error.message);
    }

    // Process Lockup Streams
    const lockupPositions = (lockupRes.streams || []).map(stream => {
        const deposited = BigInt(stream.depositedAmount || '0');
        const withdrawn = BigInt(stream.withdrawnAmount || '0');
        const locked = deposited - withdrawn;
        const endTime = Number(stream.endTime || 0);

        return {
            loanId: `sablier-lockup-${stream.id}`,
            borrower: stream.recipient,
            collateralId: stream.id,
            unlockTime: endTime,
            active: endTime > now && locked > 0n,
            token: stream.asset.id,
            tokenSymbol: stream.asset.symbol || 'SAB',
            tokenDecimals: Number(stream.asset.decimals || 18),
            quantity: locked.toString(),
            chain: 'evm',
            chainId,
            protocol: 'Sablier Lockup',
            timeline: {
                cliff: Number(stream.cliffTime || 0),
                end: endTime
            }
        };
    });

    // Process Flow Streams
    const flowPositions = (flowRes.flows || []).map(flow => {
        const withdrawn = BigInt(flow.withdrawnAmount || '0');
        const accumulated = BigInt(flow.accumulatedAmount || '0');
        const locked = accumulated - withdrawn;

        return {
            loanId: `sablier-flow-${flow.id}`,
            borrower: flow.recipient,
            collateralId: flow.id,
            unlockTime: 0, 
            active: true,
            token: flow.asset.id,
            tokenSymbol: flow.asset.symbol || 'SAB',
            tokenDecimals: Number(flow.asset.decimals || 18),
            quantity: locked.toString(),
            ratePerSecond: flow.ratePerSecond,
            chain: 'evm',
            chainId,
            protocol: 'Sablier Flow',
            timeline: {
                start: 0,
                end: 0 
            }
        };
    });

    return [...lockupPositions, ...flowPositions];
};

module.exports = { fetchSablierStreams };
