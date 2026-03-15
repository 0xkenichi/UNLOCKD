import { StreamClient } from '@streamflow/stream';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// Core dDPV Feed Implementation
export const dDPVFeed = async (collateral: { chain: string; token: string; vestingId: string }) => {
  let vestedData: any;

  if (collateral.chain === 'solana') {
    const client = new StreamClient('https://api.mainnet-beta.solana.com');
    // @ts-ignore
    vestedData = await client.getOne(collateral.vestingId);
  } else {
    // Superfluid / Sablier subgraph query placeholder
    // In production, this would use @superfluid-finance/sdk-core or Sablier SDK
    vestedData = await mockSubgraphQuery(collateral.vestingId);
  }

  return vestedData;
};

async function mockSubgraphQuery(id: string) {
  // Mocking subgraph response for Superfluid/Sablier
  return {
    flowRate: "1000000",
    unlocked: "5000000000",
    totalVested: "10000000000",
    history: [100, 105, 102, 108, 110]
  };
}
