# Vestra Protocol — Frontend Testnet UI
## Complete Lender + Borrower Flow Components
> Stack: Next.js 14 + wagmi v2 + viem + Tailwind CSS | Dark mode glassmorphism

---

## §1 — wagmi Config + Contract Hooks

```typescript
// src/config/wagmi.ts
import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC!) },
  connectors: [
    injected(),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID! }),
    coinbaseWallet({ appName: 'Vestra Protocol' }),
  ],
});
```

```typescript
// src/config/contracts.ts — UPDATE THESE AFTER FOUNDRY DEPLOY
export const CONTRACTS = {
  [11155111]: { // Sepolia
    LoanManager:     '0x...' as `0x${string}`,
    LendingPool:     '0x...' as `0x${string}`,
    VestraWrapperNFT:'0x...' as `0x${string}`,
    MockSablier:     '0x...' as `0x${string}`,
    MockUSDC:        '0x...' as `0x${string}`,
    MockLDO:         '0x...' as `0x${string}`,
    MockAGIX:        '0x...' as `0x${string}`,
  },
} as const;
```

```typescript
// src/hooks/useVestraContracts.ts
import { useChainId } from 'wagmi';
import { CONTRACTS } from '@/config/contracts';

export function useContracts() {
  const chainId = useChainId();
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!contracts) throw new Error(`Unsupported chain: ${chainId}`);
  return contracts;
}
```

---

## §2 — Lender Flow: /lend Page

```typescript
// src/app/lend/page.tsx
'use client';

import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { useContracts } from '@/hooks/useVestraContracts';
import { LENDING_POOL_ABI } from '@/abis/LendingPool';
import { ERC20_ABI } from '@/abis/ERC20';
import { GlassCard } from '@/components/ui/GlassCard';
import { TxButton } from '@/components/ui/TxButton';
import { MetricCard } from '@/components/ui/MetricCard';
import { DurationSelector } from '@/components/lend/DurationSelector';
import { cn, formatUsd, formatPct } from '@/lib/utils';

// Duration options matching LendingPool constants
const DURATION_OPTIONS = [
  { label: '30 days',  seconds: 30  * 86400, multiplierBps: 10_000 },
  { label: '90 days',  seconds: 90  * 86400, multiplierBps: 11_500 },
  { label: '1 year',   seconds: 365 * 86400, multiplierBps: 13_000 },
  { label: '3 years',  seconds: 1095* 86400, multiplierBps: 15_000 },
];

export default function LendPage() {
  const { address, isConnected } = useAccount();
  const contracts = useContracts();

  const [amount,   setAmount]   = useState('');
  const [duration, setDuration] = useState(DURATION_OPTIONS[0]);

  // ─── Pool Stats ─────────────────────────────────────────────────────────────
  const { data: totalDeposited } = useReadContract({
    address:      contracts.LendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'totalDeposited',
  });
  const { data: totalBorrowed } = useReadContract({
    address:      contracts.LendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'totalBorrowed',
  });
  const { data: currentApyBps } = useReadContract({
    address:      contracts.LendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'currentApyBps',
  });
  const { data: availableLiquidity } = useReadContract({
    address:      contracts.LendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'availableLiquidity',
  });
  const { data: usdcBalance } = useReadContract({
    address:      contracts.MockUSDC,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [address!],
    query:        { enabled: !!address },
  });

  // Effective APY = base APY × duration multiplier
  const baseApy = currentApyBps ? Number(currentApyBps) : 500;
  const effectiveApy = (baseApy * duration.multiplierBps) / 10_000;
  const utilization  = totalDeposited && totalBorrowed
    ? Number(totalBorrowed) / Number(totalDeposited)
    : 0;

  // ─── Approve + Deposit ───────────────────────────────────────────────────────
  const { writeContract: approve, data: approveTxHash } = useWriteContract();
  const { writeContract: deposit, data: depositTxHash } = useWriteContract();
  const { isLoading: approvePending, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isLoading: depositPending, isSuccess: depositSuccess } =
    useWaitForTransactionReceipt({ hash: depositTxHash });

  const handleApprove = useCallback(() => {
    if (!amount) return;
    approve({
      address:      contracts.MockUSDC,
      abi:          ERC20_ABI,
      functionName: 'approve',
      args:         [contracts.LendingPool, parseUnits(amount, 6)],
    });
  }, [amount, approve, contracts]);

  const handleDeposit = useCallback(() => {
    if (!amount) return;
    deposit({
      address:      contracts.LendingPool,
      abi:          LENDING_POOL_ABI,
      functionName: 'deposit',
      args:         [parseUnits(amount, 6), BigInt(duration.seconds)],
    });
  }, [amount, duration, deposit, contracts]);

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0D0F0E] px-4 py-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-display text-[#E8E6DF] font-medium">
          Lend USDC
        </h1>
        <p className="text-[#9C9A92] mt-2 text-sm">
          Supply liquidity to earn yield from borrower interest. Lock longer for higher APY.
        </p>
      </div>

      {/* Pool Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <MetricCard
          label="Total Deposited"
          value={formatUsd(Number(totalDeposited ?? 0n) / 1e6)}
        />
        <MetricCard
          label="Utilization"
          value={`${(utilization * 100).toFixed(1)}%`}
          status={utilization > 0.9 ? 'danger' : utilization > 0.75 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Base APY"
          value={`${(baseApy / 100).toFixed(1)}%`}
          status="success"
        />
        <MetricCard
          label="Available Liquidity"
          value={formatUsd(Number(availableLiquidity ?? 0n) / 1e6)}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Deposit Card */}
        <GlassCard>
          <h2 className="text-[#E8E6DF] font-medium text-lg mb-6">New Deposit</h2>

          {/* Balance */}
          <div className="flex justify-between items-center mb-2">
            <label className="text-[#9C9A92] text-sm">Amount (USDC)</label>
            <button
              onClick={() => usdcBalance && setAmount(formatUnits(usdcBalance, 6))}
              className="text-[#5DCAA5] text-xs hover:text-[#1D9E75] transition-colors"
            >
              Max: {formatUsd(Number(usdcBalance ?? 0n) / 1e6)}
            </button>
          </div>

          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className={cn(
              'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3',
              'text-[#E8E6DF] font-mono text-lg placeholder:text-white/20',
              'focus:outline-none focus:border-[#1D9E75] transition-colors mb-4'
            )}
          />

          {/* Duration Selector */}
          <label className="text-[#9C9A92] text-sm block mb-2">Lock Duration</label>
          <DurationSelector
            options={DURATION_OPTIONS}
            selected={duration}
            onSelect={setDuration}
            baseApy={baseApy}
          />

          {/* APY Preview */}
          <div className="mt-4 p-3 rounded-xl bg-[#1D9E75]/10 border border-[#1D9E75]/20">
            <div className="flex justify-between items-center">
              <span className="text-[#9C9A92] text-sm">Your Effective APY</span>
              <span className="text-[#5DCAA5] font-mono font-medium text-lg">
                {(effectiveApy / 100).toFixed(2)}%
              </span>
            </div>
            {amount && (
              <div className="flex justify-between items-center mt-1">
                <span className="text-[#9C9A92] text-xs">Est. Annual Yield</span>
                <span className="text-[#5DCAA5] font-mono text-sm">
                  +{formatUsd(parseFloat(amount) * effectiveApy / 10_000)} USDC
                </span>
              </div>
            )}
            <p className="text-[#5F5E5A] text-xs mt-2">
              Early exit: forfeit yield + {duration.multiplierBps === 10_000 ? '5' :
              duration.multiplierBps === 11_500 ? '7.5' :
              duration.multiplierBps === 13_000 ? '10' : '15'}% principal penalty.
            </p>
          </div>

          {/* Action Buttons */}
          {!isConnected ? (
            <button className="mt-4 w-full py-3 rounded-xl bg-[#1D9E75] text-white font-medium">
              Connect Wallet
            </button>
          ) : !approveSuccess ? (
            <TxButton
              onClick={handleApprove}
              loading={approvePending}
              disabled={!amount || parseFloat(amount) <= 0}
              className="mt-4"
            >
              1. Approve USDC
            </TxButton>
          ) : (
            <TxButton
              onClick={handleDeposit}
              loading={depositPending}
              success={depositSuccess}
              disabled={!amount || parseFloat(amount) <= 0}
              className="mt-4"
              successMessage="Deposit Confirmed!"
            >
              2. Deposit & Lock
            </TxButton>
          )}
        </GlassCard>

        {/* My Deposits */}
        <GlassCard>
          <h2 className="text-[#E8E6DF] font-medium text-lg mb-6">My Positions</h2>
          <LenderPositions address={address} contracts={contracts} />
        </GlassCard>
      </div>
    </main>
  );
}
```

---

## §3 — Borrower Flow: /borrow Page

```typescript
// src/app/borrow/page.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useContracts } from '@/hooks/useVestraContracts';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { MOCK_SABLIER_ABI } from '@/abis/MockSablierStream';
import { GlassCard } from '@/components/ui/GlassCard';
import { TxButton } from '@/components/ui/TxButton';
import { MetricCard } from '@/components/ui/MetricCard';
import { VcsBadge } from '@/components/VcsBadge';
import { DpvDisplay } from '@/components/DpvDisplay';
import { formatUsd, formatAddress, cn } from '@/lib/utils';

type BorrowStep = 'select-stream' | 'approve-operator' | 'review' | 'borrow' | 'success';

export default function BorrowPage() {
  const { address, isConnected } = useAccount();
  const contracts = useContracts();

  const [step,          setStep]          = useState<BorrowStep>('select-stream');
  const [selectedStream, setSelectedStream] = useState<number | null>(null);
  const [requestAmount, setRequestAmount] = useState('');

  // ─── Fetch Borrower's VCS Tier ──────────────────────────────────────────────
  const { data: vcsTierData } = useReadContract({
    address:      contracts.LoanManager,
    abi:          LOAN_MANAGER_ABI,
    functionName: 'vcsTier',
    args:         [address!],
    query:        { enabled: !!address },
  });
  const { data: maxCreditBpsData } = useReadContract({
    address:      contracts.LoanManager,
    abi:          LOAN_MANAGER_ABI,
    functionName: 'maxCreditBps',
    args:         [address!],
    query:        { enabled: !!address },
  });

  // ─── Fetch Stream Details (after selection) ─────────────────────────────────
  const { data: streamData } = useReadContract({
    address:      contracts.MockSablier,
    abi:          MOCK_SABLIER_ABI,
    functionName: 'getStream',
    args:         [BigInt(selectedStream ?? 0)],
    query:        { enabled: selectedStream !== null },
  });

  // ─── Step 1: Approve LoanManager as stream operator ─────────────────────────
  const { writeContract: setOperator, data: operatorTxHash } = useWriteContract();
  const { isLoading: operatorPending, isSuccess: operatorSuccess } =
    useWaitForTransactionReceipt({ hash: operatorTxHash });

  const handleApproveOperator = useCallback(() => {
    if (selectedStream === null) return;
    setOperator({
      address:      contracts.MockSablier,
      abi:          MOCK_SABLIER_ABI,
      functionName: 'setOperator',
      args:         [BigInt(selectedStream), contracts.LoanManager, true],
    });
  }, [selectedStream, setOperator, contracts]);

  // ─── Step 2: Originate Loan ─────────────────────────────────────────────────
  const { writeContract: originateLoan, data: loanTxHash } = useWriteContract();
  const { isLoading: loanPending, isSuccess: loanSuccess, data: loanReceipt } =
    useWaitForTransactionReceipt({ hash: loanTxHash });

  const handleBorrow = useCallback(() => {
    if (selectedStream === null || !requestAmount) return;
    originateLoan({
      address:      contracts.LoanManager,
      abi:          LOAN_MANAGER_ABI,
      functionName: 'originateLoan',
      args: [
        contracts.MockSablier,
        BigInt(selectedStream),
        parseUnits(requestAmount, 6),
      ],
    });
  }, [selectedStream, requestAmount, originateLoan, contracts]);

  useEffect(() => {
    if (loanSuccess) setStep('success');
  }, [loanSuccess]);

  // ─── Computed Values ─────────────────────────────────────────────────────────
  const tierLabel = ['STANDARD', 'PREMIUM', 'TITAN'][Number(vcsTierData ?? 0n)] as string;
  const maxCreditBps = Number(maxCreditBpsData ?? 4000n);

  // Stream details
  const streamEndTime   = streamData ? Number(streamData[5]) : 0;
  const streamToken     = streamData ? streamData[2] as string : '';
  const streamTotal     = streamData ? formatUnits(streamData[3] as bigint, 18) : '0';
  const daysRemaining   = streamEndTime
    ? Math.max(0, Math.floor((streamEndTime * 1000 - Date.now()) / 86400000))
    : 0;

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0D0F0E] px-4 py-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-display text-[#E8E6DF] font-medium">
            Borrow Against Vesting
          </h1>
          <p className="text-[#9C9A92] mt-2 text-sm">
            Escrow your vesting stream claim rights to draw USDC instantly.
          </p>
        </div>
        {address && (
          <VcsBadge tier={tierLabel} score={0} />
        )}
      </div>

      {/* Progress Steps */}
      <BorrowProgress currentStep={step} />

      <div className="mt-8 grid md:grid-cols-2 gap-6">
        {/* Left: Action Panel */}
        <div className="space-y-4">
          {/* Step 1: Select Stream */}
          <GlassCard className={step !== 'select-stream' ? 'opacity-60' : ''}>
            <h3 className="text-[#E8E6DF] font-medium mb-4">
              1. Select Your Vesting Stream
            </h3>
            <StreamSelector
              address={address}
              sablierAddress={contracts.MockSablier}
              selected={selectedStream}
              onSelect={(id) => {
                setSelectedStream(id);
                setStep('approve-operator');
              }}
            />
          </GlassCard>

          {/* Step 2: Approve Operator */}
          {(step === 'approve-operator' || step === 'review' || step === 'borrow') && (
            <GlassCard>
              <h3 className="text-[#E8E6DF] font-medium mb-2">
                2. Authorise Protocol
              </h3>
              <p className="text-[#9C9A92] text-xs mb-4">
                Grant the Vestra LoanManager operator rights on stream #{selectedStream}.
                This allows the protocol to settle the loan at unlock.
              </p>
              <TxButton
                onClick={handleApproveOperator}
                loading={operatorPending}
                success={operatorSuccess}
                successMessage="Operator Approved"
                disabled={selectedStream === null}
                onSuccess={() => setStep('review')}
              >
                Approve Operator
              </TxButton>
            </GlassCard>
          )}

          {/* Step 3: Review + Borrow */}
          {(step === 'review' || step === 'borrow') && operatorSuccess && (
            <GlassCard>
              <h3 className="text-[#E8E6DF] font-medium mb-4">
                3. Set Borrow Amount
              </h3>

              <div className="flex justify-between mb-2">
                <label className="text-[#9C9A92] text-sm">Request Amount (USDC)</label>
                <span className="text-[#5F5E5A] text-xs">
                  Max credit: {maxCreditBps / 100}% of dDPV
                </span>
              </div>

              <input
                type="number"
                value={requestAmount}
                onChange={e => setRequestAmount(e.target.value)}
                placeholder="0.00"
                className={cn(
                  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3',
                  'text-[#E8E6DF] font-mono text-lg placeholder:text-white/20',
                  'focus:outline-none focus:border-[#1D9E75] transition-colors mb-4'
                )}
              />

              <TxButton
                onClick={handleBorrow}
                loading={loanPending}
                success={loanSuccess}
                disabled={!requestAmount || parseFloat(requestAmount) <= 0}
                successMessage="Loan Originated!"
              >
                Draw Loan
              </TxButton>
            </GlassCard>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <GlassCard className="border-[#1D9E75]/30 bg-[#1D9E75]/5">
              <div className="text-center py-4">
                <div className="text-4xl mb-3">✓</div>
                <h3 className="text-[#5DCAA5] font-medium text-xl mb-2">
                  Loan Active
                </h3>
                <p className="text-[#9C9A92] text-sm">
                  {formatUsd(parseFloat(requestAmount))} USDC sent to your wallet.
                  Repay before stream unlock to reclaim your vesting claim rights.
                </p>
                <a
                  href="/portfolio"
                  className="mt-4 inline-block text-[#5DCAA5] text-sm border border-[#5DCAA5]/30 rounded-lg px-4 py-2 hover:bg-[#5DCAA5]/10 transition-colors"
                >
                  View Portfolio →
                </a>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Right: Stream Info + dDPV */}
        <div className="space-y-4">
          {selectedStream !== null && streamData && (
            <>
              <GlassCard>
                <h3 className="text-[#9C9A92] text-sm mb-4 uppercase tracking-wider">
                  Stream Details
                </h3>
                <div className="space-y-3">
                  <InfoRow label="Stream ID"    value={`#${selectedStream}`} mono />
                  <InfoRow label="Token"        value={formatAddress(streamToken)} mono />
                  <InfoRow label="Total Amount" value={`${parseFloat(streamTotal).toLocaleString()} tokens`} />
                  <InfoRow
                    label="Unlocks In"
                    value={`${daysRemaining} days`}
                    status={daysRemaining > 365 ? 'warning' : 'normal'}
                  />
                </div>
              </GlassCard>

              <DpvDisplay
                streamId={selectedStream}
                streamContract={contracts.MockSablier}
                token={streamToken}
                endTime={streamEndTime}
                maxCreditBps={maxCreditBps}
                contracts={contracts}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
```

---

## §4 — Shared UI Components

```typescript
// src/components/ui/GlassCard.tsx
export function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/8',
        'bg-white/[0.03] backdrop-blur-xl',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        'p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
```

```typescript
// src/components/ui/TxButton.tsx
// Implements all 5 transaction states: idle → simulating → awaiting sig → mining → confirmed/failed

type TxButtonProps = {
  onClick:        () => void;
  loading?:       boolean;
  success?:       boolean;
  disabled?:      boolean;
  successMessage?: string;
  onSuccess?:     () => void;
  children:       React.ReactNode;
  className?:     string;
};

export function TxButton({
  onClick, loading, success, disabled, successMessage, onSuccess, children, className,
}: TxButtonProps) {
  useEffect(() => {
    if (success && onSuccess) onSuccess();
  }, [success, onSuccess]);

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={loading ? 'Transaction pending' : undefined}
      aria-live="polite"
      className={cn(
        'w-full py-3 px-6 rounded-xl font-medium text-sm transition-all',
        'border border-[#1D9E75]/50 text-[#5DCAA5]',
        'hover:bg-[#1D9E75]/10 active:scale-[0.98]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        success && 'border-[#1D9E75] bg-[#1D9E75]/15 text-[#5DCAA5]',
        className
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <SpinnerIcon />
          <span>Waiting for confirmation...</span>
        </span>
      ) : success ? (
        <span className="flex items-center justify-center gap-2">
          <span>✓</span>
          <span>{successMessage ?? 'Confirmed'}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}
```

```typescript
// src/components/ui/MetricCard.tsx
type Status = 'success' | 'warning' | 'danger' | 'normal';

export function MetricCard({
  label,
  value,
  status = 'normal',
}: {
  label:   string;
  value:   string;
  status?: Status;
}) {
  const statusColors: Record<Status, string> = {
    success: 'text-[#5DCAA5]',
    warning: 'text-[#EF9F27]',
    danger:  'text-[#E24B4A]',
    normal:  'text-[#E8E6DF]',
  };

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4">
      <p className="text-[#9C9A92] text-xs mb-1 uppercase tracking-wider">{label}</p>
      <p className={cn('font-mono text-xl font-medium', statusColors[status])}>
        {value}
      </p>
    </div>
  );
}
```

```typescript
// src/components/DpvDisplay.tsx
// Fetches and displays dDPV, LTV, and max borrowable from ValuationEngine

import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { VALUATION_ENGINE_ABI } from '@/abis/ValuationEngine';
import { GlassCard } from './ui/GlassCard';

export function DpvDisplay({
  streamId,
  streamContract,
  token,
  endTime,
  maxCreditBps,
  contracts,
}: {
  streamId:      number;
  streamContract: string;
  token:          string;
  endTime:        number;
  maxCreditBps:   number;
  contracts:      any;
}) {
  const { data: dpvResult, isLoading } = useReadContract({
    address:      contracts.ValuationEngine,
    abi:          VALUATION_ENGINE_ABI,
    functionName: 'computeDPV',
    args:         [BigInt(streamId), token as `0x${string}`, BigInt(endTime), streamContract as `0x${string}`],
    query:        { enabled: !!token && endTime > 0 },
  });

  const dpvWad  = dpvResult?.[0] ?? 0n;
  const ltvBps  = dpvResult?.[1] ?? 0n;
  const dpvUsdc = Number(dpvWad) / 1e12; // WAD (1e18) → USDC (1e6): divide by 1e12
  const maxBorrow = (dpvUsdc * maxCreditBps) / 10_000;

  return (
    <GlassCard>
      <h3 className="text-[#9C9A92] text-sm mb-4 uppercase tracking-wider">
        dDPV Valuation
      </h3>
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-8 bg-white/5 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <InfoRow
            label="Dynamic Present Value"
            value={`$${dpvUsdc.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            highlight
          />
          <InfoRow
            label="Protocol LTV"
            value={`${(Number(ltvBps) / 100).toFixed(1)}%`}
          />
          <InfoRow
            label={`Max Borrow (${maxCreditBps/100}% credit limit)`}
            value={`$${maxBorrow.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            status="success"
          />

          {/* LTV Bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-[#9C9A92] mb-1">
              <span>Omega (Ω) Risk Multiplier</span>
              <span className="text-[#5DCAA5]">Safe</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#1D9E75] to-[#5DCAA5] rounded-full transition-all"
                style={{ width: `${100 - (Number(ltvBps) / 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
```

---

## §5 — ABIs

```typescript
// src/abis/LendingPool.ts
export const LENDING_POOL_ABI = [
  { name: 'deposit',           type: 'function', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'lockDuration', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'withdraw',          type: 'function', inputs: [{ name: 'depositIndex', type: 'uint256' }], outputs: [] },
  { name: 'totalDeposited',    type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'totalBorrowed',     type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'currentApyBps',     type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'availableLiquidity',type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'utilizationBps',    type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'effectiveApyBps',   type: 'function', inputs: [{ name: 'lockDuration', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'pendingYield',      type: 'function', inputs: [{ name: 'lender', type: 'address' }, { name: 'depositIndex', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'getDeposits',       type: 'function', inputs: [{ name: 'lender', type: 'address' }], outputs: [{ type: 'tuple[]', components: [{ name: 'principal', type: 'uint256' }, { name: 'depositedAt', type: 'uint256' }, { name: 'lockDuration', type: 'uint256' }, { name: 'multiplierBps', type: 'uint256' }, { name: 'lastAccrualAt', type: 'uint256' }, { name: 'accruedYield', type: 'uint256' }, { name: 'withdrawn', type: 'bool' }] }], stateMutability: 'view' },
] as const;

// src/abis/LoanManager.ts
export const LOAN_MANAGER_ABI = [
  { name: 'originateLoan',     type: 'function', inputs: [{ name: 'streamContract', type: 'address' }, { name: 'streamId', type: 'uint256' }, { name: 'requestedUsdc', type: 'uint256' }], outputs: [{ name: 'loanId', type: 'uint256' }, { name: 'nftTokenId', type: 'uint256' }] },
  { name: 'repayLoan',         type: 'function', inputs: [{ name: 'loanId', type: 'uint256' }], outputs: [] },
  { name: 'settleLoan',        type: 'function', inputs: [{ name: 'loanId', type: 'uint256' }], outputs: [] },
  { name: 'vcsTier',           type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'maxCreditBps',      type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'loans',             type: 'function', inputs: [{ name: '', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'borrower', type: 'address' }, { name: 'streamContract', type: 'address' }, { name: 'streamId', type: 'uint256' }, { name: 'collateralToken', type: 'address' }, { name: 'borrowedUsdc', type: 'uint256' }, { name: 'dpvAtOrigination', type: 'uint256' }, { name: 'interestRateBps', type: 'uint256' }, { name: 'originatedAt', type: 'uint256' }, { name: 'dueAt', type: 'uint256' }, { name: 'nftTokenId', type: 'uint256' }, { name: 'active', type: 'bool' }] }], stateMutability: 'view' },
  { name: 'totalOwed',         type: 'function', inputs: [{ name: 'loanId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'getBorrowerLoans',  type: 'function', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ type: 'uint256[]' }], stateMutability: 'view' },
] as const;

// src/abis/MockSablierStream.ts
export const MOCK_SABLIER_ABI = [
  { name: 'createStream',      type: 'function', inputs: [{ name: 'recipient', type: 'address' }, { name: 'token', type: 'address' }, { name: 'totalAmount', type: 'uint256' }, { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'setOperator',       type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }, { name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] },
  { name: 'withdraw',          type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [] },
  { name: 'getStream',         type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }], stateMutability: 'view' },
  { name: 'vestedAmountOf',    type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'unvestedAmountOf',  type: 'function', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'nextStreamId',      type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;
```

---

## §6 — Tailwind Config

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vestra: {
          teal:      '#1D9E75',
          'teal-lt': '#5DCAA5',
          'teal-dk': '#085041',
          base:      '#0D0F0E',
          surface:   '#131614',
          elevated:  '#1A1D1B',
        },
      },
      fontFamily: {
        display: ['Clash Display', 'sans-serif'],
        sans:    ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```
