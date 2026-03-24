import { createClient } from '@supabase/supabase-js';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import pino from 'pino';
import { calculateIdentityCreditScore } from '../../identityCreditScore.js';

const logger = pino({ name: 'VcsSyncService' });

// LoanManager ABI (just the function we need)
const LOAN_MANAGER_ABI = [
  {
    name: 'setVcsTier',
    type: 'function',
    inputs: [
      { name: 'borrower',   type: 'address' },
      { name: 'tier',       type: 'uint256' },
      { name: 'creditBps_', type: 'uint256' },
    ],
  },
] as const;

const TIER_MAP: Record<string, number> = {
  RECRUIT:  0,
  SCOUT:    0,
  STANDARD: 0,
  PREMIUM:  1,
  TITAN:    2,
};

export class VcsSyncService {
  private supabase:   ReturnType<typeof createClient>;
  private viemClient: ReturnType<typeof createPublicClient>;
  private wallet:     ReturnType<typeof createWalletClient>;
  private loanManagerAddress: `0x${string}`;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    rpcUrl:      string,
    relayerKey:  string,
    loanManager: string,
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.viemClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    this.wallet   = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
    this.loanManagerAddress = loanManager as `0x${string}`;
  }

  /**
   * Run the VCS sync for a single wallet.
   * Called by: cron job (every 72h) OR triggered immediately when a wallet
   * initiates a first borrow (priority=1 from vcs_sync_queue).
   */
  async syncWallet(wallet: string): Promise<void> {
    logger.info({ fn: 'syncWallet', wallet }, 'Starting VCS sync');

    try {
      // 1. Gather identity signals
      const signals = await this.gatherSignals(wallet);

      // 2. Compute VCS score
      const result = calculateIdentityCreditScore(signals);
      const { score, tier, riskMultiplier } = result;

      // 3. Map tier to maxCreditBps
      const maxCreditBps = this.tierToMaxCredit(tier, score);

      // 4. Write to Supabase (upsert identity_profiles)
      const { data: user } = await this.supabase
        .from('users')
        .select('id')
        .eq('primary_wallet', wallet.toLowerCase())
        .single();

      if (!user) {
        // Auto-create user on first sync
        const { data: newUser } = await this.supabase
          .from('users')
          .insert({ primary_wallet: wallet.toLowerCase() })
          .select('id')
          .single();

        if (!newUser) throw new Error('Failed to create user record');
      }

      const userId = user?.id;

      await this.supabase.from('identity_profiles').upsert({
        user_id:              userId,
        vcs_score:            score,
        tier,
        max_credit_limit_bps: maxCreditBps,
        ...signals,
        last_sync:            new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // 5. Push tier on-chain to LoanManager (RELAYER_ROLE required)
      await this.pushTierOnChain(wallet, tier, maxCreditBps);

      // 6. Flag Titan wallets for manual onboarding
      if (tier === 'TITAN') {
        await this.supabase
          .from('users')
          .update({ genesis_flag: true })
          .eq('primary_wallet', wallet.toLowerCase());

        logger.warn({ wallet, score }, 'TITAN tier flagged — Genesis onboarding required');
      }

      logger.info({ fn: 'syncWallet', wallet, score, tier, maxCreditBps }, 'VCS sync complete');

    } catch (err: any) {
      logger.error({ err: err.message, wallet }, 'VCS sync failed');
      throw err;
    }
  }

  /**
   * Process the vcs_sync_queue. Called by a cron every 30 minutes.
   * Processes up to 50 wallets per run, priority-ordered.
   */
  async processSyncQueue(): Promise<void> {
    const { data: queue, error } = await this.supabase
      .from('vcs_sync_queue')
      .select('*')
      .is('processed_at', null)
      .order('priority', { ascending: true })
      .order('queued_at',  { ascending: true })
      .limit(50);

    if (error || !queue?.length) return;

    for (const item of queue) {
      try {
        await this.syncWallet(item.wallet);
        await this.supabase
          .from('vcs_sync_queue')
          .update({ processed_at: new Date().toISOString() })
          .eq('id', item.id);
      } catch {
        // Log already happened in syncWallet — continue to next
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async gatherSignals(wallet: string): Promise<Record<string, any>> {
    // On testnet: fetch from available APIs. On mainnet: add Gitcoin + World ID.
    const [txCount, gitcoinScore, hasWorldId] = await Promise.allSettled([
      this.fetchTxCount(wallet),
      this.fetchGitcoinScore(wallet),
      this.fetchWorldId(wallet),
    ]);

    return {
      gitcoin_passport_score: gitcoinScore.status === 'fulfilled' ? gitcoinScore.value : 0,
      has_world_id:           hasWorldId.status  === 'fulfilled' ? hasWorldId.value   : false,
      attestations:           [],  // EAS integration: v2
      tx_count:               txCount.status === 'fulfilled' ? txCount.value : 0,
      balance_usd:            '0', // Zerion/Alchemy balance API: v2
      total_repaid_loans:     await this.fetchRepaidLoans(wallet),
      has_defaults:           await this.fetchHasDefaults(wallet),
    };
  }

  private async fetchTxCount(wallet: string): Promise<number> {
    const count = await this.viemClient.getTransactionCount({ address: wallet as `0x${string}` });
    return count;
  }

  private async fetchGitcoinScore(wallet: string): Promise<number> {
    try {
      const resp = await fetch(
        `https://api.passport.gitcoin.co/registry/score/${wallet}`,
        {
          headers: { 'X-API-KEY': process.env.GITCOIN_API_KEY || '' },
          signal:  AbortSignal.timeout(5_000),
        }
      );
      if (!resp.ok) return 0;
      const data = await resp.json() as { score: string };
      return parseFloat(data.score || '0');
    } catch {
      return 0; // Graceful degradation — score contribution zeroed
    }
  }

  private async fetchWorldId(wallet: string): Promise<boolean> {
    // World ID verification: check EAS attestation schema on Sepolia
    // Schema: world-id-v2 (placeholder — wire real EAS query here)
    return false; // testnet: World ID not required
  }

  private async fetchRepaidLoans(wallet: string): Promise<number> {
    const { count } = await this.supabase
      .from('loans')
      .select('id', { count: 'exact', head: true })
      .eq('borrower_wallet', wallet.toLowerCase())
      .eq('status', 'repaid');
    return count ?? 0;
  }

  private async fetchHasDefaults(wallet: string): Promise<boolean> {
    const { count } = await this.supabase
      .from('loans')
      .select('id', { count: 'exact', head: true })
      .eq('borrower_wallet', wallet.toLowerCase())
      .eq('status', 'defaulted');
    return (count ?? 0) > 0;
  }

  private tierToMaxCredit(tier: string, score: number): number {
    if (tier === 'TITAN')   return 6500;
    if (tier === 'PREMIUM') return 5000;
    if (score >= 500)       return 4000; // STANDARD
    if (score >= 300)       return 2000; // SCOUT
    return 1000;                         // RECRUIT
  }

  private async pushTierOnChain(wallet: string, tier: string, maxCreditBps: number): Promise<void> {
    const onChainTier = TIER_MAP[tier] ?? 0;
    try {
      const hash = await this.wallet.writeContract({
        address: this.loanManagerAddress,
        abi:     LOAN_MANAGER_ABI,
        functionName: 'setVcsTier',
        args:    [wallet as `0x${string}`, BigInt(onChainTier), BigInt(maxCreditBps)],
      });
      logger.info({ fn: 'pushTierOnChain', wallet, tier, hash }, 'VCS tier pushed on-chain');
    } catch (err: any) {
      // Non-fatal: on-chain push can be retried. Supabase is source of truth for now.
      logger.error({ err: err.message, wallet }, 'On-chain VCS push failed');
    }
  }
}
