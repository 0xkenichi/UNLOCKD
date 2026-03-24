'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { useContracts } from '@/hooks/useVestraContracts';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { MOCK_SABLIER_ABI } from '@/abis/MockSablierStream';
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

  const [step,          setStep]          = useState<BorrowStep>('select-stream');
  const [selectedStream, setSelectedStream] = useState<number | null>(null);
  const [requestAmount, setRequestAmount] = useState('');

  // ─── Fetch Borrower's VCS Tier ──────────────────────────────────────────────
  const { data: vcsTierData } = useReadContract({
    address:      contracts.loanManager,
    abi:          LOAN_MANAGER_ABI,
    functionName: 'vcsTier',
    args:         [address!],
    query:        { enabled: !!address },
  });
  const { data: maxCreditBpsData } = useReadContract({
    address:      contracts.loanManager,
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
      address:      (contracts as any).MockSablier,
      abi:          MOCK_SABLIER_ABI,
      functionName: 'setOperator',
      args:         [BigInt(selectedStream), contracts.loanManager, true],
    });
  }, [selectedStream, setOperator, contracts]);

  // ─── Step 2: Originate Loan ─────────────────────────────────────────────────
  const { writeContract: originateLoan, data: loanTxHash } = useWriteContract();
  const { isLoading: loanPending, isSuccess: loanSuccess } =
    useWaitForTransactionReceipt({ hash: loanTxHash });

  const handleBorrow = useCallback(() => {
    if (selectedStream === null || !requestAmount) return;
    originateLoan({
      address:      contracts.loanManager,
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
  const tierLabel = ['STANDARD', 'PREMIUM', 'TITAN'][Number(vcsTierData ?? 0n)] as string || 'STANDARD';
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
          <h1 className="text-3xl font-display text-[#E8E6DF] font-medium redaction-text">
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
            <h3 className="text-[#E8E6DF] font-medium mb-4 redaction-text uppercase tracking-tight">
              1. Select Your Vesting Stream
            </h3>
            <StreamSelector
              address={address}
              sablierAddress={contracts.MockSablier}
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
                <h3 className="text-[#5DCAA5] font-medium text-xl mb-2 redaction-text uppercase tracking-tight">
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
