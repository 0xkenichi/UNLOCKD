'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useContracts } from '@/hooks/useVestraContracts';
import { usePassportSnapshot } from '@/hooks/usePassportSnapshot';
import { VESTRA_PROTOCOL_ABI } from '@/abis/VestraProtocol';
import { SABLIER_V2_LOCKUP_ABI } from '@/abis/SablierV2Lockup';
import { VESTRA_CREDIT_REGISTRY_ABI } from '@/abis/VestraCreditRegistry';
import { GlassCard } from '@/components/ui/GlassCard';
import { TxButton } from '@/components/ui/TxButton';
import { VcsBadge } from '@/components/VcsBadge';
import { DpvDisplay } from '@/components/DpvDisplay';
import { BorrowProgress } from '@/components/borrow/BorrowProgress';
import { StreamSelector } from '@/components/borrow/StreamSelector';
import { InfoRow } from '@/components/InfoRow';
import { formatUsd, formatAddress, cn } from '@/lib/utils';

type BorrowStep = 'select-stream' | 'approve-operator' | 'review' | 'borrow' | 'success';

export default function BorrowPage() {
  const { address, isConnected } = useAccount();
  const contracts = useContracts();
  const passport = usePassportSnapshot(address);

  const [step,          setStep]          = useState<BorrowStep>('select-stream');
  const [selectedStream, setSelectedStream] = useState<number | null>(null);
  const [requestAmount, setRequestAmount] = useState('');
  const [durationDays,  setDurationDays]  = useState('30');
  const [maxBorrowVal,  setMaxBorrowVal]  = useState(0);

  // ─── Fetch Borrower's VCS Status ──────────────────────────────────────────────
  // ─── Fetch Borrower's VCS Status (On-Chain) ──────────────────────────────────
  const { data: vcsTier } = useReadContract({
    address:      contracts.registry,
    abi:          VESTRA_CREDIT_REGISTRY_ABI,
    functionName: 'getTier',
    args:         [address!],
    query:        { enabled: !!address },
  });

  // ─── Fetch Stream Details (after selection) ─────────────────────────────────
  const { data: streamResults } = useReadContracts({
    contracts: [
      {
        address:      contracts.sablierV2Lockup,
        abi:          SABLIER_V2_LOCKUP_ABI,
        functionName: 'getAsset',
        args:         [BigInt(selectedStream ?? 0)],
      },
      {
        address:      contracts.sablierV2Lockup,
        abi:          SABLIER_V2_LOCKUP_ABI,
        functionName: 'getDepositedAmount',
        args:         [BigInt(selectedStream ?? 0)],
      },
      {
        address:      contracts.sablierV2Lockup,
        abi:          SABLIER_V2_LOCKUP_ABI,
        functionName: 'getEndTime',
        args:         [BigInt(selectedStream ?? 0)],
      },
    ],
    query: { enabled: selectedStream !== null },
  });

  // ─── Step 1: Approve LoanManager as stream operator ─────────────────────────
  const { writeContract: setOperator, data: operatorTxHash } = useWriteContract();
  const { isLoading: operatorPending, isSuccess: operatorSuccess } =
    useWaitForTransactionReceipt({ hash: operatorTxHash });

  const handleApproveOperator = useCallback(() => {
    if (selectedStream === null) return;
    setOperator({
      address:      contracts.sablierV2Lockup,
      abi:          SABLIER_V2_LOCKUP_ABI,
      functionName: 'setApproved',
      args:         [BigInt(selectedStream), contracts.vestingAdapter, true],
    });
  }, [selectedStream, setOperator, contracts]);

  // ─── Step 2: Create Loan ───────────────────────────────────────────────────
  const { writeContract: borrow, data: loanTxHash } = useWriteContract();
  const { isLoading: loanPending, isSuccess: loanSuccess } =
    useWaitForTransactionReceipt({ hash: loanTxHash });
  
  const handleBorrow = useCallback(() => {
    if (selectedStream === null || !requestAmount) return;
    borrow({
      address:      contracts.loanManager,
      abi:          VESTRA_PROTOCOL_ABI,
      functionName: 'borrow',
      args:         [BigInt(selectedStream), contracts.vestingAdapter],
    });
  }, [selectedStream, requestAmount, borrow, contracts]);

  useEffect(() => {
    if (loanSuccess) setStep('success');
  }, [loanSuccess]);

  // ─── Computed Values ─────────────────────────────────────────────────────────
  const maxCreditBps = passport.ltvBoostBps || 1000; // Base LTV 10%
  const rateAdjustmentBps = passport.rateSurchargeOrDiscountBps || 0;
  const baseAprBps = 1200; // 12% Base APR
  const finalAprBps = Math.max(200, baseAprBps + rateAdjustmentBps);

  // Stream details (Safe access for results)
  const streamToken     = streamResults?.[0]?.result as string || '';
  const streamQuantity  = (streamResults?.[1]?.result as bigint) || 0n;
  const streamEndTime   = Number(streamResults?.[2]?.result || 0);
  const streamTotal     = formatUnits(streamQuantity, 18);
  const daysRemaining   = streamEndTime
    ? Math.max(0, Math.floor((streamEndTime * 1000 - Date.now()) / 86400000))
    : 0;

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0D0F0E] px-4 py-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-display text-[#E8E6DF] font-medium redaction-text">
            Borrow Against Vesting
          </h1>
          <p className="text-[#9C9A92] mt-2 text-sm">
            Escrow your vesting stream claim rights to draw USDC instantly.
          </p>
        </div>
        {address && (
          <VcsBadge 
            tier={passport.tierName || (vcsTier === 1 ? 'PREMIUM' : vcsTier === 2 ? 'TITAN' : 'STANDARD')} 
            score={passport.compositeScore || 0} 
          />
        )}
      </div>

      {/* Progress Steps */}
      <BorrowProgress currentStep={step} />

      <div className="mt-8 grid md:grid-cols-2 gap-6">
        {/* Left: Action Panel */}
        <div className="space-y-4">
          {/* Step 1: Select Stream */}
          <GlassCard className={step !== 'select-stream' ? 'opacity-60' : ''}>
            <h3 className="text-[#E8E6DF] font-medium mb-4 redaction-text uppercase tracking-tight">
              1. Select Your Vesting Stream
            </h3>
            <StreamSelector
              address={address}
              selected={selectedStream}
              onSelect={(id: number) => {
                setSelectedStream(id);
                setStep('approve-operator');
              }}
            />
          </GlassCard>

          {/* Step 2: Approve Operator */}
          {(step === 'approve-operator' || step === 'review' || step === 'borrow') && (
            <GlassCard>
              <h3 className="text-[#E8E6DF] font-medium mb-2 redaction-text uppercase tracking-tight">
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
              <h3 className="text-[#E8E6DF] font-medium mb-4 redaction-text uppercase tracking-tight">
                3. Loan Terms
              </h3>

              <div className="space-y-4 mb-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[#9C9A92] text-sm">Amount (USDC)</label>
                    <span className="text-[#5F5E5A] text-xs">Max credit: {maxCreditBps / 100}%</span>
                  </div>
                  <input
                    type="number"
                    value={requestAmount}
                    onChange={e => setRequestAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#E8E6DF] font-mono"
                  />
                  <div className="flex gap-2 mt-2">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => {
                          const amount = (maxBorrowVal * (pct / 100));
                          setRequestAmount(amount > 0 ? amount.toFixed(2) : '0.00');
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#9C9A92] text-[10px] uppercase hover:bg-white/10 transition-colors"
                      >
                        {pct === 100 ? 'Max' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[#9C9A92] text-sm">Duration (Days)</label>
                    <span className="text-[#E8E6DF] text-xs font-mono">{durationDays}d</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="365"
                    step="30"
                    value={durationDays}
                    onChange={e => setDurationDays(e.target.value)}
                    className="w-full accent-[#1D9E75]"
                  />
                </div>
              </div>

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
                <h3 className="text-[#5DCAA5] font-medium text-xl mb-2 redaction-text uppercase tracking-tight">
                  Loan Active
                </h3>
                <p className="text-[#9C9A92] text-sm">
                  {formatUsd(parseFloat(requestAmount))} USDC sent to your wallet.
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
          {selectedStream !== null && streamResults && (
            <>
              <GlassCard>
                <h3 className="text-[#9C9A92] text-sm mb-4 uppercase tracking-wider redaction-text">
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
                quantity={streamQuantity}
                streamContract={contracts.sablierV2Lockup}
                token={streamToken}
                endTime={streamEndTime}
                maxCreditBps={maxCreditBps}
                contracts={contracts}
                finalAprBps={finalAprBps}
                tierName={passport.tierName || 'Scout'}
                onMaxBorrow={setMaxBorrowVal}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
