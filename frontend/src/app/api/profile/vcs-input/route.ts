import { NextResponse } from "next/server";
import { 
  getNativeBalance, 
  getTransactionList,
  ChainId
} from "@/utils/etherscanV2";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:4000";

async function fetchGitcoinScore(address: string): Promise<number> {
  try {
    const scorerId = process.env.NEXT_PASSPORT_SCORER_ID || process.env.GITCOIN_PASSPORT_SCORER_ID;
    const apiKey = process.env.NEXT_PASSPORT_API_KEY || process.env.GITCOIN_PASSPORT_API_KEY;
    if (!scorerId || !apiKey) return 0;
    const res = await fetch(
      `https://api.scorer.gitcoin.co/registry/score/${scorerId}/${address}`,
      { headers: { "X-API-KEY": apiKey } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return parseFloat(data.score ?? "0");
  } catch {
    return 0;
  }
}

async function fetchInternalCreditHistory(address: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/internal/credit-history/${address}`);
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return {
      totalRepaidLoans: 0, totalRepaidUsd: 0, hasActiveDefaults: false,
      lateRepaymentCount: 0, veCrdtBalance: 0, gaugeVotesCount: 0,
    };
  }
}

async function aggregateOnChainMetrics(address: string) {
  const chains: ChainId[] = ["1", "8453", "42161"]; // ETH, Base, Arbitrum
  
  try {
    // 1. Fetch native balances
    const balanceResults = await Promise.all(chains.map(c => getNativeBalance(address, c)));
    let totalBalanceEth = 0;
    balanceResults.forEach(res => {
        if (res) totalBalanceEth += parseFloat(res) / 1e18;
    });
    const balanceUsd = totalBalanceEth * 2500; // Simplified ETH price

    // 2. Fetch transaction history across chains
    const txResults = await Promise.all(chains.map(c => getTransactionList(address, c)));
    const allTxs = txResults.flat().filter(Boolean).sort((a: any, b: any) => parseInt(a.timeStamp) - parseInt(b.timeStamp));
    
    const txCount = allTxs.length;
    let walletAgedays = 0;
    let latestTxTimestamp = 0;
    let volumeTraded = 0;
    let largestTx = 0;
    const protocols = new Set<string>();

    if (txCount > 0) {
      const firstTs = parseInt(allTxs[0].timeStamp);
      latestTxTimestamp = parseInt(allTxs[allTxs.length - 1].timeStamp);
      walletAgedays = Math.max(1, Math.floor((Date.now() / 1000 - firstTs) / 86400));
      
      allTxs.forEach((tx: any) => {
          const val = parseFloat(tx.value) / 1e18;
          volumeTraded += val;
          if (val > largestTx) largestTx = val;
          if (tx.to && tx.to !== address) protocols.add(tx.to); // Simplified protocol detection
      });
    }

    return {
      txCount,
      walletAgedays,
      balanceUsd,
      latestTxTimestamp,
      uniqueProtocolsUsed: protocols.size,
      volumeTraded: volumeTraded * 2500,
      largestTx: largestTx * 2500,
    };
  } catch (error) {
    console.error("VCS Metrics Aggregation Error:", error);
    return { 
      txCount: 0, walletAgedays: 0, balanceUsd: 0, 
      latestTxTimestamp: 0, uniqueProtocolsUsed: 0, volumeTraded: 0, largestTx: 0 
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.toLowerCase();

  if (!address) {
    return NextResponse.json({ error: "Address missing" }, { status: 400 });
  }

  // 1. Check Cache
  try {
    const cacheRes = await fetch(`${BACKEND_URL}/internal/vcs-score/${address}`);
    if (cacheRes.ok) {
        const { score } = await cacheRes.json();
        if (score && score.last_updated) {
            const lastUpdate = new Date(score.last_updated).getTime();
            const now = Date.now();
            // 24 hour TTL
            if (now - lastUpdate < 24 * 60 * 60 * 1000 && score.raw_data) {
                console.log(`[vcs-input] Cache Hit for ${address}`);
                const data = typeof score.raw_data === 'string' ? JSON.parse(score.raw_data) : score.raw_data;
                const safeData = JSON.parse(
                  JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
                );
                return NextResponse.json(safeData);
            }
        }
    }
  } catch (e) {
    console.warn(`[vcs-input] Cache check failed, proceeding to fetch:`, e);
  }

  console.log(`[vcs-input] Cache Miss/Stale for ${address}. Fetching fresh data...`);

  // 2. Fetch Fresh Data
  const [gitcoin, history, metrics] = await Promise.all([
    fetchGitcoinScore(address),
    fetchInternalCreditHistory(address),
    aggregateOnChainMetrics(address),
  ]);

  const payload = {
    gitcoinPassportScore: gitcoin,
    ...metrics,
    ...history,
    activeVestingUsd: 0, // To be integrated with VestingService
    vestingMonthlyInflowUsd: 0,
    demoMode: false
  };

  // 3. Compute v3.0 Result for authoritative cache metadata
  const { computeVcs } = require("@/lib/vcsEngine");
  const vcsResult = computeVcs(payload);

  // 4. Save to Cache
  const safePayload = JSON.parse(JSON.stringify(payload, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

  try {
    await fetch(`${BACKEND_URL}/internal/vcs-score/${address}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            gitcoin_score: gitcoin,
            tx_count: metrics.txCount,
            wallet_age_days: metrics.walletAgedays,
            balance_usd: metrics.balanceUsd,
            volume_traded: metrics.volumeTraded,
            total_vcs_score: vcsResult.score,
            tier: vcsResult.tier,
            raw_data: safePayload
        })
    });
  } catch (e) {
    console.error(`[vcs-input] Failed to update cache:`, e);
  }

  const safeResponse = JSON.parse(
    JSON.stringify(payload, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );

  return NextResponse.json(safeResponse);
}
