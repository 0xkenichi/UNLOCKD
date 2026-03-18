import { NextResponse } from 'next/server';

// Extractors from packages/backend logic (re-implemented for absolute serverless compatibility)
// Sablier V2 Subgraph for Sepolia
const SABLIER_SUBGRAPH_URL = `https://gateway.thegraph.com/api/deploy-key/subgraphs/id/CsDNYv8qL6m8CZZbrx8X9B9Y6pQ`;

async function fetchSablier(wallet: string) {
  const query = `
    query GetStreams($recipient: Bytes!) {
      streams(where: { recipient: $recipient,资产_not: "0x0000000000000000000000000000000000000000", status_not: "DEPLETED" }, first: 20) {
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
      }
    }
  `;

  try {
    const res = await fetch(SABLIER_SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { recipient: wallet.toLowerCase() } }),
    });
    const { data } = await res.json();
    return (data?.streams || []).map((s: any) => ({
      id: `sablier-${s.id}`,
      protocol: 'Sablier',
      chain: 'evm',
      token: s.asset.symbol,
      amount: (BigInt(s.depositedAmount) - BigInt(s.withdrawnAmount)).toString(),
      unlockTime: Number(s.endTime),
    }));
  } catch (e) {
    return [];
  }
}

export async function GET(
  request: Request,
  { params }: { params: { address: string } }
) {
  const address = params.address;

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }

  try {
    // Perform parallel discovery for Vercel edge/serverless speed
    const [sablier] = await Promise.all([
      fetchSablier(address),
      // Add more serverless-friendly extractors here (Superfluid, Streamflow)
    ]);

    const results = [...sablier];

    return NextResponse.json({
      success: true,
      address,
      count: results.length,
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
