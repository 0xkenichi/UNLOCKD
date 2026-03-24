/**
 * VestingOracleService.ts — Phase 2 complete
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-chain vesting discovery service for Vestra Protocol.
 *
 * Phase 2 changes over v1:
 *   1. scheduleUpdate() hook wired — every discovered EVM vesting position
 *      triggers a live dDPV re-evaluation via DDPVService.
 *   2. Multi-chain viem clients — Sepolia, Base, ASI Chain resolved from
 *      EVM_CHAIN_CONFIG. Hardcoded sepolia client removed.
 *   3. Real Streamflow SDK — mock removed entirely. Uses @streamflow/stream v9+.
 *      Queries via client.searchStreams({ recipient }) on SolanaStreamClient.
 *      Returns Array<{ publicKey, account }>. canceledAt and end checks filter
 *      out stale/cancelled streams. Schedule inferred from cliff metadata.
 *   4. Per-chain Sablier subgraph URLs — Base and ASI indexed correctly.
 *   5. Deduplication by (protocol:id) before enqueue.
 *   6. VestingPosition now carries `schedule` — passed directly to dDPV inputs.
 *
 * Streamflow SDK quick reference (v9):
 *   import { StreamflowSolana } from '@streamflow/stream';
 *   const client = new StreamflowSolana.SolanaStreamClient(rpcUrl);
 *   const results = await client.searchStreams({ recipient: '<base58>' });
 *   // results: Array<{ publicKey: { toBase58(): string }; account: Stream }>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createPublicClient, http, type PublicClient } from 'viem';
import { sepolia, base } from 'viem/chains';
import { request, gql } from 'graphql-request';
import { StreamflowSolana } from '@streamflow/stream';

import { ddpvService, type TokenRiskInputs } from './dDPVService';

// ─── Streamflow stream shape ──────────────────────────────────────────────────

/**
 * Minimal subset of the Streamflow SDK Stream type we actually consume.
 * Typed explicitly to decouple from SDK version changes.
 */
interface StreamflowStream {
  /** SPL token mint public key */
  mint:            { toBase58(): string };
  /** Total deposited token amount (BN) */
  depositedAmount: { toString(): string };
  /** Stream end / full-unlock unix timestamp (seconds) */
  end:             number;
  /** Cliff timestamp in seconds (0 if no cliff) */
  cliff:           number;
  /** Amount unlocked at cliff (BN) */
  cliffAmount:     { toString(): string };
  /** Non-zero when the stream has been cancelled */
  canceledAt:      number;
  /** Unlock interval in seconds (1 = continuous linear) */
  period:          number;
  /** Sender-supplied stream name */
  name:            string;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface VestingPosition {
  id:           string;
  protocol:     'Sablier' | 'Streamflow' | 'Superfluid';
  chain:        string;
  chainId:      number;
  /** Symbol (EVM) or mint base58 (Solana) */
  token:        string;
  tokenAddress: string;
  /** Raw token units — pass to BigInt() */
  amount:       string;
  /** Unix seconds — full unlock timestamp */
  unlockTime:   number;
  /** Vesting shape — drives Q_eff in dDPV */
  schedule:     'CLIFF' | 'LINEAR';
  isVested:     boolean;
  wallet:       string;
}

// ─── EVM chain config ─────────────────────────────────────────────────────────

interface ChainEntry {
  chain:           any;
  rpcUrl:          string;
  sablierSubgraph: string;
  chainId:         number;
}

const EVM_CHAIN_CONFIG: Record<string, ChainEntry> = {
  sepolia: {
    chain:           sepolia,
    rpcUrl:          process.env.ALCHEMY_SEPOLIA_URL || '',
    sablierSubgraph: 'https://api.thegraph.com/subgraphs/name/sablier-labs/sablier-v2-sepolia',
    chainId:         11155111,
  },
  base: {
    chain:           base,
    rpcUrl:          process.env.ALCHEMY_BASE_URL || '',
    sablierSubgraph: 'https://api.thegraph.com/subgraphs/name/sablier-labs/sablier-v2-base',
    chainId:         8453,
  },
  asi: {
    chain: {
      id:   192,
      name: 'ASI Chain',
      nativeCurrency: { name: 'FET', symbol: 'FET', decimals: 18 },
      rpcUrls: { default: { http: [process.env.ASI_RPC_URL || 'https://rpc.asi.network'] } },
    },
    rpcUrl:          process.env.ASI_RPC_URL || 'https://rpc.asi.network',
    sablierSubgraph: process.env.ASI_SABLIER_SUBGRAPH || '',
    chainId:         192,
  },
};

// ─── Solana RPC fallback chain ────────────────────────────────────────────────

/**
 * Tried in order. Helius (env-configured) first for higher reliability,
 * then public mainnet, then devnet as a last resort.
 */
const SOLANA_RPC_ENDPOINTS: string[] = [
  process.env.HELIUS_RPC_URL || '',
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'https://api.devnet.solana.com',
].filter(Boolean);

// ─── Schedule inference ───────────────────────────────────────────────────────

/**
 * Infers whether a Streamflow stream is CLIFF or LINEAR from its on-chain
 * metadata. Used to populate the `schedule` field on VestingPosition so
 * dDPVService can compute the correct Q_effective.
 *
 * Rules:
 *   CLIFF — cliff amount ≥ 95% of deposited amount (effectively a token lock)
 *   CLIFF — vesting duration (end - cliff) ≤ 2 periods (near-instant unlock)
 *   LINEAR — everything else (gradual release over time)
 */
function inferSchedule(s: StreamflowStream): 'CLIFF' | 'LINEAR' {
  const deposited = BigInt(s.depositedAmount.toString());
  const cliffAmt  = BigInt(s.cliffAmount.toString());

  // Cliff unlocks ≥95% of total → treat as cliff vesting
  if (deposited > 0n && cliffAmt * 100n >= deposited * 95n) return 'CLIFF';

  // No meaningful vesting period after cliff
  if (s.cliff > 0 && s.period > 0 && (s.end - s.cliff) <= s.period * 2) return 'CLIFF';

  return 'LINEAR';
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class VestingOracleService {
  private evmClients: Map<string, PublicClient>;

  constructor() {
    this.evmClients = new Map(
      Object.entries(EVM_CHAIN_CONFIG).map(([key, cfg]) => [
        key,
        createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) }),
      ])
    );
  }

  /**
   * Primary API. Discovers all active vesting positions for `wallet` across
   * every configured chain and enqueues EVM positions for dDPV evaluation.
   *
   * @param wallet           0x hex address (EVM) or base58 public key (Solana)
   * @param chains           Chain group(s) to query
   * @param loanDurationSecs Prospective loan duration for dDPV Q_eff calculation
   */
  async fetchAndEnqueue(
    wallet:           string,
    chains:           'evm' | 'solana' | 'all' = 'all',
    loanDurationSecs: number                   = 30 * 86400,
  ): Promise<VestingPosition[]> {
    const raw: VestingPosition[] = [];

    if (chains === 'evm' || chains === 'all') {
      for (const [key, cfg] of Object.entries(EVM_CHAIN_CONFIG)) {
        raw.push(...await this.fetchSablierPositions(wallet, key, cfg));
      }
    }

    if (chains === 'solana' || chains === 'all') {
      raw.push(...await this.fetchStreamflowPositions(wallet));
    }

    // Deduplicate by (protocol:id)
    const seen = new Set<string>();
    const deduped = raw.filter(p => {
      const key = `${p.protocol}:${p.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await this.enqueueForDDPV(deduped, loanDurationSecs);
    return deduped;
  }

  /** Legacy compat shim. */
  async fetchUserVestings(
    wallet: string,
    chain:  'evm' | 'solana' | 'all',
  ): Promise<VestingPosition[]> {
    return this.fetchAndEnqueue(wallet, chain);
  }

  // ─── EVM: Sablier v2 ──────────────────────────────────────────────────────

  private async fetchSablierPositions(
    wallet:   string,
    chainKey: string,
    cfg:      ChainEntry,
  ): Promise<VestingPosition[]> {
    if (!cfg.sablierSubgraph) {
      console.warn(`[VestingOracle] No Sablier subgraph configured for chain: ${chainKey}`);
      return [];
    }

    try {
      const query = gql`
        query getStreams($recipient: String!) {
          streams(
            where: { recipient: $recipient, canceled: false }
            orderBy: endTime
            orderDirection: desc
            first: 100
          ) {
            id
            token { id symbol decimals }
            depositAmount
            startTime
            endTime
            cliff
          }
        }
      `;

      const data: any = await request(cfg.sablierSubgraph, query, {
        recipient: wallet.toLowerCase(),
      });

      return (data.streams || []).map((s: any) => {
        const cliffTs   = s.cliff ? parseInt(s.cliff, 10) : 0;
        const endTs     = parseInt(s.endTime, 10);
        const schedule: 'CLIFF' | 'LINEAR' = (cliffTs > 0 && cliffTs < endTs) ? 'LINEAR' : 'CLIFF';

        return {
          id:           s.id,
          protocol:     'Sablier' as const,
          chain:        chainKey,
          chainId:      cfg.chainId,
          token:        s.token.symbol,
          tokenAddress: s.token.id,
          amount:       s.depositAmount,
          unlockTime:   cliffTs > 0 ? cliffTs : endTs,
          schedule,
          isVested:     true,
          wallet,
        };
      });
    } catch (err: any) {
      console.warn(`[VestingOracle] Sablier fetch failed on ${chainKey}:`, err.message);
      return [];
    }
  }

  // ─── Solana: Streamflow real SDK ──────────────────────────────────────────

  /**
   * Queries the Streamflow protocol on-chain for all vesting streams where
   * `wallet` is the recipient. Uses searchStreams() which filters server-side —
   * no need to fetch and scan all streams.
   *
   * Tries each RPC endpoint in SOLANA_RPC_ENDPOINTS until one succeeds.
   * Filters out: cancelled streams, already-unlocked streams.
   * Infers schedule (CLIFF vs LINEAR) from stream cliff/period metadata.
   */
  private async fetchStreamflowPositions(wallet: string): Promise<VestingPosition[]> {
    const now = Math.floor(Date.now() / 1000);

    for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
      try {
        const client = new StreamflowSolana.SolanaStreamClient(rpcUrl);

        // searchStreams returns { publicKey: { toBase58(): string }; account: Stream }[]
        const results: Array<{
          publicKey: { toBase58(): string };
          account:   StreamflowStream;
        }> = await client.searchStreams({ recipient: wallet });

        const positions = results
          .filter(({ account: s }) => {
            if (s.canceledAt && s.canceledAt > 0) return false;  // cancelled
            if (s.end <= now) return false;                        // already unlocked
            return true;
          })
          .map(({ publicKey, account: s }) => ({
            id:           publicKey.toBase58(),
            protocol:     'Streamflow' as const,
            chain:        'solana',
            chainId:      0,
            token:        s.mint.toBase58(),
            tokenAddress: s.mint.toBase58(),
            amount:       s.depositedAmount.toString(),
            unlockTime:   s.end,
            schedule:     inferSchedule(s),
            isVested:     true,
            wallet,
          }));

        console.log(
          `[VestingOracle] Streamflow: found ${positions.length} active positions ` +
          `for ${wallet.slice(0, 8)}... via ${rpcUrl.replace(/\/v\d.*/, '')}`
        );

        return positions;
      } catch (err: any) {
        console.warn(
          `[VestingOracle] Streamflow SDK failed (${rpcUrl.replace(/\/v\d.*/, '')}):`,
          err.message
        );
        // Try next endpoint
      }
    }

    console.error('[VestingOracle] All Streamflow RPC endpoints exhausted.');
    return [];
  }

  // ─── dDPV enqueue ─────────────────────────────────────────────────────────

  /**
   * Enqueues EVM positions into the dDPV BullMQ pipeline.
   * Solana positions are logged but deferred — on-chain ValuationEngine calls
   * require EVM; Solana collateral valuation is a Phase 3 off-chain path.
   */
  private async enqueueForDDPV(
    positions:        VestingPosition[],
    loanDurationSecs: number,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    for (const pos of positions) {
      if (!pos.unlockTime || pos.unlockTime <= now) {
        console.debug(`[VestingOracle] Skip already-unlocked: ${pos.id}`);
        continue;
      }

      if (pos.chain === 'solana') {
        console.info(
          `[VestingOracle] Solana position (deferred — Phase 3): ` +
          `${pos.id.slice(0, 8)}... mint=${pos.tokenAddress.slice(0, 8)}... ` +
          `unlocks=${new Date(pos.unlockTime * 1000).toISOString()} schedule=${pos.schedule}`
        );
        continue;
      }

      const inputs: TokenRiskInputs = {
        token:            pos.tokenAddress as `0x${string}`,
        chainId:          pos.chainId,
        quantity:         BigInt(pos.amount),
        unlockTime:       pos.unlockTime,
        schedule:         pos.schedule,
        loanDurationSecs,
      };

      try {
        await ddpvService.scheduleUpdate(inputs);
        console.log(
          `[VestingOracle] dDPV job enqueued: ${pos.protocol} ${pos.id} ` +
          `chain=${pos.chainId} schedule=${pos.schedule} ` +
          `unlocks=${new Date(pos.unlockTime * 1000).toISOString()}`
        );
      } catch (err: any) {
        console.error(`[VestingOracle] Enqueue failed for ${pos.id}:`, err.message);
      }
    }
  }
}

export const vestingOracle = new VestingOracleService();
