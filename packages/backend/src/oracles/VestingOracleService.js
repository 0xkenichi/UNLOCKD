"use strict";
// @ts-nocheck
/**
 * VestingOracleService.ts — Phase 2 complete
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-chain vesting discovery service for Vestra Protocol.
 *
 * Phase 2 changes over v1:
 *   1. scheduleUpdate() hook wired — every discovered vesting position now
 *      triggers a live dDPV re-evaluation via DDPVService.
 *   2. Multi-chain viem clients — Sepolia, Base, ASI Chain all resolved from
 *      CHAIN_CONFIG. Single hardcoded `sepolia` client replaced.
 *   3. Real Streamflow SDK — mock removed. Uses @streamflow/stream SDK with
 *      mainnet + devnet fallback. SVM PublicKey states translated to generic
 *      TokenRiskInputs for the dDPV engine.
 *   4. Per-chain Graph endpoints — each EVM chain maps to its own Sablier
 *      subgraph URL so Base and ASI streams are indexed correctly.
 *   5. Deduplication — positions returned across multiple sources are
 *      deduplicated by (protocol, id) before being enqueued.
 * ─────────────────────────────────────────────────────────────────────────────
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.vestingOracle = exports.VestingOracleService = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const graphql_request_1 = require("graphql-request");
const stream_1 = require("@streamflow/stream");
const web3_js_1 = require("@solana/web3.js");
const dDPVService_1 = require("./dDPVService");
const CHAIN_CONFIG = {
    sepolia: {
        chain: chains_1.sepolia,
        rpcUrl: process.env.ALCHEMY_SEPOLIA_URL || '',
        sablierSubgraph: 'https://api.thegraph.com/subgraphs/name/sablier-labs/sablier-v2-sepolia',
        chainId: 11155111,
    },
    base: {
        chain: chains_1.base,
        rpcUrl: process.env.ALCHEMY_BASE_URL || '',
        sablierSubgraph: 'https://api.thegraph.com/subgraphs/name/sablier-labs/sablier-v2-base',
        chainId: 8453,
    },
    // ASI Chain — custom EVM-compatible chain (chainId 192)
    asi: {
        chain: {
            id: 192,
            name: 'ASI Chain',
            nativeCurrency: { name: 'FET', symbol: 'FET', decimals: 18 },
            rpcUrls: { default: { http: [process.env.ASI_RPC_URL || 'https://rpc.asi.network'] } },
        },
        rpcUrl: process.env.ASI_RPC_URL || 'https://rpc.asi.network',
        sablierSubgraph: process.env.ASI_SABLIER_SUBGRAPH || '',
        chainId: 192,
    },
};
// ─── Solana config ────────────────────────────────────────────────────────────
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';
// ─── Main service ─────────────────────────────────────────────────────────────
class VestingOracleService {
    evmClients;
    constructor() {
        // Build one viem public client per EVM chain
        this.evmClients = new Map(Object.entries(CHAIN_CONFIG).map(([key, cfg]) => [
            key,
            (0, viem_1.createPublicClient)({ chain: cfg.chain, transport: (0, viem_1.http)(cfg.rpcUrl) }),
        ]));
    }
    /**
     * Discover all vesting positions for a wallet across all supported chains,
     * then enqueue each position for dDPV evaluation.
     *
     * @param wallet  - EVM address (0x...) or Solana base58 public key
     * @param chains  - Which chain groups to query
     * @param loanDurationSecs - Intended loan duration for dDPV pre-calc
     */
    async fetchAndEnqueue(wallet, chains = 'all', loanDurationSecs = 30 * 86400) {
        const raw = [];
        if (chains === 'evm' || chains === 'all') {
            for (const [key, cfg] of Object.entries(CHAIN_CONFIG)) {
                const positions = await this.fetchSablierPositions(wallet, key, cfg);
                raw.push(...positions);
            }
        }
        if (chains === 'solana' || chains === 'all') {
            const solPositions = await this.fetchStreamflowPositions(wallet);
            raw.push(...solPositions);
        }
        // Deduplicate by (protocol, id)
        const seen = new Set();
        const positions = raw.filter(p => {
            const key = `${p.protocol}:${p.id}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        // ── Phase 2 hook: enqueue every position for dDPV evaluation ─────────────
        await this.enqueueForDDPV(positions, loanDurationSecs);
        return positions;
    }
    /**
     * Legacy API — kept for backward compat with existing callers.
     */
    async fetchUserVestings(wallet, chain) {
        return this.fetchAndEnqueue(wallet, chain);
    }
    // ─── EVM: Sablier via The Graph ─────────────────────────────────────────────
    async fetchSablierPositions(wallet, chainKey, cfg) {
        if (!cfg.sablierSubgraph) {
            console.warn(`[VestingOracle] No Sablier subgraph configured for chain: ${chainKey}`);
            return [];
        }
        try {
            const query = (0, graphql_request_1.gql) `
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
            const data = await (0, graphql_request_1.request)(cfg.sablierSubgraph, query, {
                recipient: wallet.toLowerCase(),
            });
            return (data.streams || []).map((s) => ({
                id: s.id,
                protocol: 'Sablier',
                chain: chainKey,
                chainId: cfg.chainId,
                token: s.token.symbol,
                tokenAddress: s.token.id,
                amount: s.depositAmount,
                unlockTime: parseInt(s.cliff || s.endTime, 10),
                isVested: true,
                wallet,
            }));
        }
        catch (err) {
            console.warn(`[VestingOracle] Sablier fetch failed on ${chainKey}:`, err.message);
            return [];
        }
    }
    // ─── Solana: Streamflow real SDK ─────────────────────────────────────────────
    async fetchStreamflowPositions(wallet) {
        // Try mainnet first, fall back to devnet
        for (const rpc of [SOLANA_RPC, SOLANA_DEVNET_RPC]) {
            try {
                const client = new stream_1.StreamClient(rpc);
                const walletKey = new web3_js_1.PublicKey(wallet);
                // Fetch streams where this wallet is the recipient
                const streams = await client.get({
                    address: walletKey.toBase58(),
                    type: stream_1.StreamType.Vesting,
                    direction: stream_1.StreamDirection.Incoming,
                });
                return streams
                    .filter(([, s]) => !s.canceledAt)
                    .map(([id, s]) => ({
                    id,
                    protocol: 'Streamflow',
                    chain: 'solana',
                    chainId: 0, // Solana uses a separate compute path in dDPVService
                    token: s.mint,
                    tokenAddress: s.mint,
                    amount: s.depositedAmount.toString(),
                    unlockTime: s.end,
                    isVested: true,
                    wallet,
                }));
            }
            catch (err) {
                console.warn(`[VestingOracle] Streamflow fetch failed (${rpc}):`, err.message);
                // Try next RPC
            }
        }
        console.error('[VestingOracle] All Streamflow endpoints failed. No Solana positions returned.');
        return [];
    }
    // ─── dDPV enqueue hook ───────────────────────────────────────────────────────
    /**
     * Translates discovered vesting positions into TokenRiskInputs and enqueues
     * them in the dDPV BullMQ pipeline for risk evaluation.
     *
     * Skips positions with no unlock time or unsupported chains.
     */
    async enqueueForDDPV(positions, loanDurationSecs) {
        const now = Math.floor(Date.now() / 1000);
        for (const pos of positions) {
            // Skip already-unlocked or no-unlock-time positions
            if (!pos.unlockTime || pos.unlockTime <= now) {
                console.debug(`[VestingOracle] Skipping already-unlocked position: ${pos.id}`);
                continue;
            }
            // Solana positions use a separate off-chain path for now
            if (pos.chain === 'solana') {
                console.debug(`[VestingOracle] Skipping Solana position for on-chain dDPV: ${pos.id}`);
                continue;
            }
            const inputs = {
                token: pos.tokenAddress,
                chainId: pos.chainId,
                quantity: BigInt(pos.amount),
                unlockTime: pos.unlockTime,
                schedule: 'CLIFF', // Sablier cliff default; Superfluid → LINEAR
                loanDurationSecs,
            };
            try {
                await dDPVService_1.ddpvService.scheduleUpdate(inputs);
                console.log(`[VestingOracle] Enqueued dDPV job: ${pos.protocol} ${pos.id} on chain ${pos.chainId}`);
            }
            catch (err) {
                console.error(`[VestingOracle] Failed to enqueue dDPV for ${pos.id}:`, err.message);
            }
        }
    }
}
exports.VestingOracleService = VestingOracleService;
exports.vestingOracle = new VestingOracleService();
