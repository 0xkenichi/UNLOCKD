const { request, gql } = require('graphql-request');
const { parseAbi } = require('viem');

// Sablier Envio Multi-chain Indexer (Aggregated Data)
const SABLIER_ENVIO_ENDPOINT = 'https://indexer.hyperindex.xyz/53b7e25/v1/graphql';

const SABLIER_ENABLED = process.env.EVM_SABLIER_ENABLED === 'true';
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// ABIs for real-time validation
const SABLIER_LOCKUP_ABI = parseAbi([
    'function getStatus(uint256 streamId) view returns (uint8)',
    'function getStream(uint256 streamId) view returns (address sender, address recipient, uint128 depositedAmount, address asset, uint40 startTime, uint40 endTime, uint40 cliffTime, uint128 withdrawnAmount, bool cancellable, bool transferrable)'
]);

const LOCKUP_QUERY = gql`
  query GetLockupPositions($recipients: [String!]) {
    Stream(where: { 
      recipient: { _in: $recipients },
      status: { _neq: "DEPLETED" }
    }, limit: 50, order_by: { createdAtTimestamp: desc }) {
      id
      chainId
      contractAddress
      recipient
      asset { id symbol decimals }
      depositedAmount
      withdrawnAmount
      cliffTime
      endTime
      status
      createdAtTimestamp
    }
  }
`;

const FLOW_QUERY = gql`
  query GetFlowPositions($recipients: [String!]) {
    Flow(where: {
      recipient: { _in: $recipients },
      status: { _neq: "VOIDED" }
    }, limit: 50, order_by: { createdAtTimestamp: desc }) {
      id
      chainId
      contractAddress
      recipient
      asset { id symbol decimals }
      ratePerSecond
      accumulatedAmount
      withdrawnAmount
      status
      createdAtTimestamp
    }
  }
`;

/**
 * Fetch Sablier Streams (Lockup & Flow)
 * Now uses Envio multi-chain indexer for unified fetching across all chains.
 */
const fetchSablierStreams = async (wallets = [], chainId = null, client = null) => {
    if (!SABLIER_ENABLED || !wallets.length) {
        return [];
    }

    const recipients = wallets.map(w => w.toLowerCase());
    const now = Math.floor(Date.now() / 1000);

    let lockupRes = { Stream: [] };
    let flowRes = { Flow: [] };

    try {
        // Envio handles multi-chain queries in a single endpoint
        [lockupRes, flowRes] = await Promise.all([
            request(SABLIER_ENVIO_ENDPOINT, LOCKUP_QUERY, { recipients }),
            request(SABLIER_ENVIO_ENDPOINT, FLOW_QUERY, { recipients })
        ]);
    } catch (error) {
        if (!DEMO_MODE) {
            console.error(`[sablier] Envio fetch error:`, error.message);
        }
        return [];
    }

    // Process Lockup Streams
    const lockupPositions = (lockupRes.Stream || []).map(stream => {
        // Filter by chainId if provided (to match VestingOracleService's loop if needed)
        // However, Envio is better called once. We handle chainId filtering here for compatibility.
        if (chainId && Number(stream.chainId) !== chainId) return null;

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
            chainId: Number(stream.chainId),
            protocol: 'Sablier Lockup',
            timeline: {
                cliff: Number(stream.cliffTime || 0),
                end: endTime,
                start: Number(stream.createdAtTimestamp || 0)
            }
        };
    }).filter(Boolean);

    // Process Flow Streams
    const flowPositions = (flowRes.Flow || []).map(flow => {
        if (chainId && Number(flow.chainId) !== chainId) return null;

        const withdrawn = BigInt(flow.withdrawnAmount || '0');
        const accumulated = BigInt(flow.accumulatedAmount || '0');
        const locked = accumulated - withdrawn;

        return {
            loanId: `sablier-flow-${flow.id}`,
            borrower: flow.recipient,
            collateralId: flow.id,
            unlockTime: 0, 
            active: flow.status !== 'VOIDED',
            token: flow.asset.id,
            tokenSymbol: flow.asset.symbol || 'SAB',
            tokenDecimals: Number(flow.asset.decimals || 18),
            quantity: locked.toString(),
            ratePerSecond: flow.ratePerSecond,
            chain: 'evm',
            chainId: Number(flow.chainId),
            protocol: 'Sablier Flow',
            timeline: {
                start: Number(flow.createdAtTimestamp || 0),
                end: 0 
            }
        };
    }).filter(Boolean);

    return [...lockupPositions, ...flowPositions];
};

module.exports = { fetchSablierStreams };
