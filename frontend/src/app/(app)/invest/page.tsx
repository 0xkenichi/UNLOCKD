'use client';

import { motion } from 'framer-motion';
import { formatUnits } from 'viem';
import { InvestRow } from '@/components/invest/InvestRow';
import { GlassCard } from '@/components/ui/GlassCard';
import { MetricCard } from '@/components/ui/MetricCard';
import { usePoolStats } from '@/hooks/usePoolStats';
import { formatUsd } from '@/lib/utils';
import { ShieldCheck, Activity, Percent } from 'lucide-react';

const pct = (bps: bigint) => `${(Number(bps) / 100).toFixed(2)}%`;
const usd = (v: bigint) => formatUsd(Number(formatUnits(v, 6)));

/**
 * Vestra has a single lending vault: the LendingPool (ERC-4626, USDC).
 * Everything on this page is read live from it; the only yield is the pool's variable rate.
 */
export default function InvestPage() {
  const stats = usePoolStats();

  const capped = stats.depositCap > 0n;
  const progress = capped
    ? Number((stats.totalAssets * 10_000n) / stats.depositCap) / 100
    : Number(stats.utilizationBps) / 100;

  return (
    <main className="min-h-screen bg-[#020617] selection:bg-blue-500/30 px-4 py-12 pb-24">
      <div className="max-w-6xl mx-auto space-y-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight font-display text-white mb-2">Invest</h1>
          <p className="text-white/40 text-sm max-w-xl">
            Supply USDC to the Vestra lending pool and earn the floating interest paid by borrowers against
            vesting positions. Rates move with utilization; there are no lock-ups.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Pool Assets" value={usd(stats.totalAssets)} />
          <MetricCard label="Utilization" value={pct(stats.utilizationBps)} icon={<Activity className="w-5 h-5" />} />
          <MetricCard label="Borrow Rate (variable)" value={pct(stats.borrowRateBps)} icon={<Percent className="w-5 h-5" />} />
          <MetricCard label="Insurance Reserve" value={usd(stats.insuranceBalance)} icon={<ShieldCheck className="w-5 h-5" />} />
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <InvestRow
            name="Vestra USDC Pool"
            description="Lends to borrowers against escrowed vesting streams. Interest accrues continuously into the share price."
            apy={pct(stats.supplyApyBps)}
            aum={usd(stats.totalAssets)}
            maxCap={capped ? usd(stats.depositCap) : undefined}
            progress={progress}
            progressLabel={capped ? 'Vault Capacity' : 'Utilization'}
            withdrawal="Instant, up to idle liquidity"
            href="/lend"
          />
        </motion.div>

        <GlassCard className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
          <h2 className="text-lg font-bold text-white mb-4">Risk summary</h2>
          <ul className="space-y-2 text-sm text-white/50 leading-relaxed list-disc pl-5">
            <li>Supply APY ≈ borrow rate × utilization × (1 − {pct(stats.reserveFactorBps)} reserve factor). It is an estimate and changes block to block.</li>
            <li>Defaulted loans are sold by Dutch auction. Shortfalls are covered by the insurance vault first, then shared by all lenders through the share price.</li>
            <li>Withdrawals are limited to the pool&apos;s idle liquidity ({usd(stats.availableLiquidity)} now); high utilization can delay exits.</li>
          </ul>
        </GlassCard>
      </div>
    </main>
  );
}
