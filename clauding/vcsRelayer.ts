/**
 * VCS Relayer Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridges the off-chain VCS engine and the on-chain VestraCreditRegistry.
 *
 * Responsibilities:
 *   1. Listen for RescoreRequested events from the registry
 *   2. Pull identity/activity data from providers (Gitcoin, World ID, EAS, etc.)
 *   3. Run the VCS engine → get score + tier + parameters
 *   4. Push the result to VestraCreditRegistry.updateScore()
 *   5. Proactive refresh: re-score any address whose score is ≥ 20h old
 *
 * Security note (open gap #5): This service should be upgraded to a 2/3 multisig
 * relayer before mainnet — a single EOA is insufficient for mainnet RELAYER_ROLE.
 *
 * @license BSL-1.1  Copyright © 2026 Vestra Protocol
 */

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, base } from "viem/chains";
import { computeVcs, VcsInput, VcsResult, VcsTier } from "./vcsEngine";

// ─── Configuration ─────────────────────────────────────────────────────────

const REGISTRY_ABI = parseAbi([
  "event RescoreRequested(address indexed borrower, uint32 requestedAt)",
  "function updateScore(address borrower, uint16 score, uint8 tier, uint16 ltvBoostBps, int16 rateAdjBps, uint256 maxBorrowCap, uint16 omegaFloorBps) external",
  "function isStale(address borrower) view returns (bool)",
  "function getRecord(address borrower) view returns (uint16 score, uint8 tier, uint32 updatedAt, uint16 ltvBoostBps, int16 rateAdjBps, uint256 maxBorrowCap, uint16 omegaFloorBps)",
]);

const TIER_ENUM: Record<VcsTier, number> = {
  STANDARD: 0,
  PREMIUM:  1,
  TITAN:    2,
};

// ─── Provider adapters ─────────────────────────────────────────────────────

interface ProviderData {
  gitcoinPassportScore: number;
  hasWorldID: boolean;
  easAttestations: Array<{ schema: string; attester: string; revoked: boolean }>;
  txCount: number;
  walletAgedays: number;
  uniqueProtocolsUsed: number;
  balanceUsd: number;
  activeVestingUsd: number;
  vestingMonthlyInflowUsd: number;
}

async function fetchGitcoinScore(address: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.scorer.gitcoin.co/registry/score/${process.env.GITCOIN_SCORER_ID}/${address}`,
      { headers: { "X-API-KEY": process.env.GITCOIN_API_KEY ?? "" } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return parseFloat(data.score ?? "0");
  } catch {
    return 0;
  }
}

async function fetchWorldIDVerified(address: string): Promise<boolean> {
  try {
    // World ID on-chain verification via the WorldID Identity Manager
    // In production: query the WorldID contract or a subgraph
    const res = await fetch(
      `${process.env.WORLDID_API_URL}/verified/${address}`
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.verified === true;
  } catch {
    return false;
  }
}

async function fetchEasAttestations(address: string) {
  try {
    const query = `{
      attestations(
        where: { recipient: { equals: "${address}" } }
        take: 50
      ) {
        id schema { id } attester revoked
      }
    }`;
    const res = await fetch("https://sepolia.easscan.org/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data?.attestations ?? []).map((a: any) => ({
      schema:   a.schema.id,
      attester: a.attester,
      revoked:  a.revoked,
    }));
  } catch {
    return [];
  }
}

async function fetchOnChainActivity(address: string): Promise<{
  txCount: number;
  walletAgedays: number;
  uniqueProtocolsUsed: number;
  balanceUsd: number;
}> {
  try {
    // Etherscan / Alchemy enhanced API — replace with your preferred indexer
    const [txRes, balRes] = await Promise.allSettled([
      fetch(
        `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY}`
      ),
      fetch(
        `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}/getTokenBalances?address=${address}`
      ),
    ]);

    let txCount = 0, walletAgedays = 0, uniqueProtocols = 0, balanceUsd = 0;

    if (txRes.status === "fulfilled" && txRes.value.ok) {
      const txData = await txRes.value.json();
      const txs = txData.result ?? [];
      txCount = txs.length;
      if (txCount > 0) {
        const firstTs = parseInt(txs[0].timeStamp);
        walletAgedays = Math.floor((Date.now() / 1000 - firstTs) / 86400);
        const toAddresses = new Set(txs.map((t: any) => t.to?.toLowerCase()).filter(Boolean));
        uniqueProtocols = toAddresses.size;
      }
    }

    // Simplified USD balance from stablecoins
    // Production: use a price-aware portfolio endpoint
    balanceUsd = 5000; // placeholder

    return { txCount, walletAgedays, uniqueProtocolsUsed: uniqueProtocols, balanceUsd };
  } catch {
    return { txCount: 0, walletAgedays: 0, uniqueProtocolsUsed: 0, balanceUsd: 0 };
  }
}

async function fetchVestingData(address: string): Promise<{
  activeVestingUsd: number;
  vestingMonthlyInflowUsd: number;
}> {
  try {
    // Queries Sablier V2, Superfluid, and Hedgey subgraphs
    // In production, this would use the unified VestingOracleService 
    // or a specialized indexing endpoint.
    const res = await fetch(
      `${process.env.BACKEND_API_URL}/vesting/summary/${address}`
    );
    if (!res.ok) return { activeVestingUsd: 0, vestingMonthlyInflowUsd: 0 };
    return await res.json();
  } catch {
    return { activeVestingUsd: 0, vestingMonthlyInflowUsd: 0 };
  }
}

async function fetchVestraHistory(address: string): Promise<{
  totalRepaidLoans: number;
  totalRepaidUsd: number;
  hasActiveDefaults: boolean;
  lateRepaymentCount: number;
  veCrdtBalance: number;
  gaugeVotesCount: number;
}> {
  // Query your own Supabase / SQLite database
  // This is the only truly authoritative source for Vestra-internal data
  try {
    const res = await fetch(
      `${process.env.BACKEND_API_URL}/internal/credit-history/${address}`,
      { headers: { Authorization: `Bearer ${process.env.INTERNAL_API_KEY}` } }
    );
    if (!res.ok) return defaults();
    return await res.json();
  } catch {
    return defaults();
  }

  function defaults() {
    return {
      totalRepaidLoans: 0, totalRepaidUsd: 0, hasActiveDefaults: false,
      lateRepaymentCount: 0, veCrdtBalance: 0, gaugeVotesCount: 0,
    };
  }
}

// ─── Core rescore function ─────────────────────────────────────────────────

async function rescoreAddress(address: string): Promise<VcsResult> {
  // Parallel fetch from all providers
  const [gitcoin, worldId, eas, activity, history, vesting] = await Promise.all([
    fetchGitcoinScore(address),
    fetchWorldIDVerified(address),
    fetchEasAttestations(address),
    fetchOnChainActivity(address),
    fetchVestraHistory(address),
    fetchVestingData(address),
  ]);

  const input: VcsInput = {
    gitcoinPassportScore:  gitcoin,
    hasWorldID:            worldId,
    easAttestations:       eas,
    txCount:               activity.txCount,
    walletAgedays:         activity.walletAgedays,
    uniqueProtocolsUsed:   activity.uniqueProtocolsUsed,
    balanceUsd:            activity.balanceUsd,
    totalRepaidLoans:      history.totalRepaidLoans,
    totalRepaidUsd:        history.totalRepaidUsd,
    hasActiveDefaults:     history.hasActiveDefaults,
    lateRepaymentCount:    history.lateRepaymentCount,
    veCrdtBalance:         history.veCrdtBalance,
    gaugeVotesCount:       history.gaugeVotesCount,
    activeVestingUsd:      vesting.activeVestingUsd,
    vestingMonthlyInflowUsd: vesting.vestingMonthlyInflowUsd,
  };

  return computeVcs(input);
}

// ─── On-chain push ─────────────────────────────────────────────────────────

async function pushScore(
  address: string,
  result: VcsResult,
  walletClient: ReturnType<typeof createWalletClient>,
  registryAddress: `0x${string}`
) {
  const tierEnum = TIER_ENUM[result.tier];

  // rateAdjBps can be negative — Solidity int16 handles sign correctly
  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "updateScore",
    args: [
      address as `0x${string}`,
      result.score,
      tierEnum,
      result.ltvBoostBps,
      result.rateSurchargeOrDiscountBps,
      BigInt(result.maxBorrowCapUsdc) * BigInt(1e6), // convert to USDC 6-decimal
      Math.round(result.breakdown.creditHistory.earned * 10), // omegaFloor approx from score
    ],
  });

  console.log(`[VCSRelayer] Score pushed for ${address}: score=${result.score} tier=${result.tier} tx=${hash}`);
  return hash;
}

// ─── Proactive refresh worker ──────────────────────────────────────────────

async function proactiveRefreshWorker(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  registryAddress: `0x${string}`,
  knownAddresses: string[]
) {
  console.log(`[VCSRelayer] Proactive refresh — checking ${knownAddresses.length} addresses`);

  for (const address of knownAddresses) {
    const stale = await publicClient.readContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "isStale",
      args: [address as `0x${string}`],
    });

    if (stale) {
      console.log(`[VCSRelayer] Stale score — rescoring ${address}`);
      const result = await rescoreAddress(address);
      await pushScore(address, result, walletClient, registryAddress);
      await new Promise(r => setTimeout(r, 2000)); // rate-limit tx submissions
    }
  }
}

// ─── Event listener ────────────────────────────────────────────────────────

export async function startRelayer() {
  const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as `0x${string}`);
  const registryAddress = process.env.VCS_REGISTRY_ADDRESS as `0x${string}`;

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.RPC_URL),
  });

  console.log("[VCSRelayer] Starting — relayer:", account.address);

  // Listen for RescoreRequested events
  publicClient.watchContractEvent({
    address: registryAddress,
    abi: REGISTRY_ABI,
    eventName: "RescoreRequested",
    onLogs: async (logs) => {
      for (const log of logs) {
        const borrower = (log as any).args.borrower as string;
        console.log(`[VCSRelayer] RescoreRequested for ${borrower}`);
        const result = await rescoreAddress(borrower);
        await pushScore(borrower, result, walletClient, registryAddress);
      }
    },
  });

  // Proactive 20-hour refresh cycle
  const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000;
  const knownAddresses: string[] = []; // populate from your DB

  setInterval(async () => {
    await proactiveRefreshWorker(publicClient, walletClient, registryAddress, knownAddresses);
  }, REFRESH_INTERVAL_MS);

  // Run immediately on startup
  await proactiveRefreshWorker(publicClient, walletClient, registryAddress, knownAddresses);
}

startRelayer().catch(console.error);
