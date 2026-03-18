import { StreamClient } from '@streamflow/stream';
import { createPublicClient, http } from 'viem';
import { mainnet, base, sepolia } from 'viem/chains';
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';

const SABLIER_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/sablier-labs/sablier-v2';
const SUPERFLUID_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-sepolia';

const apolloClients: { [key: string]: ApolloClient<any> } = {
  sablier: new ApolloClient({
    uri: SABLIER_SUBGRAPH_URL,
    cache: new InMemoryCache(),
  }),
  superfluid: new ApolloClient({
    uri: SUPERFLUID_SUBGRAPH_URL,
    cache: new InMemoryCache(),
  }),
};

// Core dDPV Feed Implementation
export const dDPVFeed = async (collateral: { chain: string; token: string; vestingId: string; provider?: 'sablier' | 'superfluid' }) => {
  let vestedData: any;

  if (collateral.chain === 'solana') {
    const client = new StreamClient('https://api.mainnet-beta.solana.com');
    vestedData = await client.getOne(collateral.vestingId);
    return {
        id: collateral.vestingId,
        amount: vestedData.amount.toString(),
        unlocked: vestedData.releasedAmount.toString(),
        unlockTime: vestedData.endTime,
        raw: vestedData
    };
  } else {
    const provider = collateral.provider || 'sablier';
    const client = apolloClients[provider];
    
    if (provider === 'sablier') {
        const query = gql`
            query getStream($id: ID!) {
                stream(id: $id) {
                    id
                    amount
                    startTime
                    endTime
                    cliffTime
                    totalAmount
                    withdrawnAmount
                }
            }
        `;
        const { data } = await client.query({ query, variables: { id: collateral.vestingId } });
        return {
            id: data.stream.id,
            amount: data.stream.totalAmount,
            unlocked: data.stream.withdrawnAmount,
            unlockTime: data.stream.endTime,
            raw: data.stream
        };
    } else {
        // Superfluid implementation
        const query = gql`
            query getFlow($id: ID!) {
                flow(id: $id) {
                    id
                    flowRate
                    lastUpdate
                    sum
                    token {
                        id
                        symbol
                    }
                }
            }
        `;
        const { data } = await client.query({ query, variables: { id: collateral.vestingId } });
        return {
            id: data.flow.id,
            flowRate: data.flow.flowRate,
            lastUpdate: data.flow.lastUpdate,
            raw: data.flow
        };
    }
  }
};
