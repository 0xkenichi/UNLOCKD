'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, isAddress } from 'viem';
import { useContracts } from '@/hooks/useVestraContracts';
import { usePassportSnapshot } from '@/hooks/usePassportSnapshot';
import { useStreamCollateral } from '@/hooks/useStreamCollateral';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { VESTING_ADAPTER_ABI } from '@/abis/VestingAdapter';
import { ERC721_ABI } from '@/abis/ERC721';
import { VESTING_PROTOCOL, VESTING_PROTOCOL_LABELS, type VestingProtocolId } from '@/abis/VestingProtocols';
import { GlassCard } from '@/components/ui/GlassCard';
import { TxButton } from '@/components/ui/TxButton';
import { VcsBadge } from '@/components/VcsBadge';
import { DpvDisplay } from '@/components/DpvDisplay';
import { BorrowProgress } from '@/components/borrow/BorrowProgress';
import { StreamSelector } from '@/components/borrow/StreamSelector';
import { InfoRow } from '@/components/InfoRow';
import { formatUsd, formatAddress, cn, parseUsdc } from '@/lib/utils';

type BorrowStep = 'select-stream' | 'approve-operator' | 'review' | 'borrow' | 'success';

const ZERO = '0x0000000000000000000000000000000000000000';
const DAY = 86_400;

export default function BorrowPage() {
  const { address } = useAccount();
  const contracts = useContracts();
  const passport = usePassportSnapshot(address);

  const [step,           setStep]           = useState<BorrowStep>('select-stream');
  const [selectedStream, setSelectedStream] = useState<number | null>(null);
  const [protocol,       setProtocol]       = useState<VestingProtocolId>(VESTING_PROTOCOL.SABLIER_V2);
  const [nftInput,       setNftInput]       = useState<string>(contracts.sablierV2Lockup);
  const [requestAmount,  setRequestAmount]  = useState('');
  const [maturityDays,   setMaturityDays]   = useState<number | null>(null); // null = at unlock
  const [maxBorrowVal,   setMaxBorrowVal]   = useState(0);

  const nftContract = isAddress(nftInput) ? (nftInput as `0x${string}`) : undefined;
  const streamId = selectedStream !== null ? BigInt(selectedStream) : null;

  // ─── Stream collateral (read exactly as VestingAdapter will) ─────────────────
  const stream = useStreamCollateral(protocol, nftContract, streamId);

  // ─── Ownership / approval / whitelist checks ─────────────────────────────────
  const { data: checks, refetch: refetchChecks } = useReadContracts({
    contracts: [
      { address: nftContract ?? ZERO, abi: ERC721_ABI, functionName: 'ownerOf', args: [streamId ?? 0n] },
      { address: nftContract ?? ZERO, abi: ERC721_ABI, functionName: 'getApproved', args: [streamId ?? 0n] },
      { address: nftContract ?? ZERO, abi: ERC721_ABI, functionName: 'isApprovedForAll', args: [(address ?? ZERO) as `0x${string}`, contracts.vestingAdapter] },
      { address: contracts.vestingAdapter, abi: VESTING_ADAPTER_ABI, functionName: 'whitelisted', args: [protocol, (nftContract ?? ZERO) as `0x${string}`] },
      { address: contracts.loanManager, abi: LOAN_MANAGER_ABI, functionName: 'minBorrow' },
    ],
    query: { enabled: !!nftContract && streamId !== null },
  });

  const owner        = checks?.[0]?.result as string | undefined;
  const approvedTo   = checks?.[1]?.result as string | undefined;
  const approvedAll  = Boolean(checks?.[2]?.result);
  const whitelisted  = checks?.[3]?.status === 'success' ? Boolean(checks[3].result) : undefined;
  const minBorrowRaw = (checks?.[4]?.result as bigint | undefined) ?? 0n;
  const isOwner      = !!owner && !!address && owner.toLowerCase() === address.toLowerCase();
  const isApproved   = approvedAll || (!!approvedTo && approvedTo.toLowerCase() === contracts.vestingAdapter.toLowerCase());

  // ─── Step 2: Approve the stream NFT to VestingAdapter ───────────────────────
  const { writeContract: approveNft, data: approveTxHash } = useWriteContract();
  const { isLoading: approvePending, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const handleApproveNft = useCallback(() => {
    if (streamId === null || !nftContract) return;
    approveNft({
      address:      nftContract,
      abi:          ERC721_ABI,
      functionName: 'approve',
      args:         [contracts.vestingAdapter, streamId],
    });
  }, [streamId, nftContract, approveNft, contracts]);

  useEffect(() => {
    if (approveSuccess) refetchChecks();
  }, [approveSuccess, refetchChecks]);

  useEffect(() => {
    if (step === 'approve-operator' && isApproved) setStep('review');
  }, [step, isApproved]);

  // ─── Step 3: Borrow ──────────────────────────────────────────────────────────
  const { writeContract: borrow, data: loanTxHash, error: borrowError } = useWriteContract();
  const { isLoading: loanPending, isSuccess: loanSuccess } =
    useWaitForTransactionReceipt({ hash: loanTxHash });

  const nowSec        = Math.floor(Date.now() / 1000);
  const daysRemaining = stream.unlockTime ? Math.max(0, Math.floor((stream.unlockTime - nowSec) / DAY)) : 0;

  // maturity = 0 means "at unlock" on-chain; otherwise it must be in (now, unlockTime].
  const maturity = maturityDays === null || !stream.unlockTime
    ? 0n
    : BigInt(Math.min(nowSec + maturityDays * DAY, stream.unlockTime));

  const handleBorrow = useCallback(() => {
    if (streamId === null || !nftContract || parseUsdc(requestAmount) === 0n) return;
    borrow({
      address:      contracts.loanManager,
      abi:          LOAN_MANAGER_ABI,
      functionName: 'borrow',
      args:         [nftContract, streamId, protocol, parseUsdc(requestAmount), maturity],
    });
  }, [streamId, nftContract, protocol, requestAmount, maturity, borrow, contracts]);

  useEffect(() => {
    if (loanSuccess) setStep('success');
  }, [loanSuccess]);

  // ─── Computed Values ─────────────────────────────────────────────────────────
  const streamTotal    = formatUnits(stream.quantity, 18);
  const requestRaw     = parseUsdc(requestAmount);
  const belowMinimum   = requestRaw > 0n && requestRaw < minBorrowRaw;
  const aboveMax       = Number(requestAmount || 0) > maxBorrowVal;
  const sablierBlocked = protocol === VESTING_PROTOCOL.SABLIER_V2 && (stream.cancelable || stream.canceled);

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
            Escrow your vesting-stream NFT to draw USDC instantly. Variable rate, non-recourse.
          </p>
        </div>
        {address && passport.tierName && (
          <VcsBadge
            tier={passport.tierName}
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

            <div className="space-y-3 mb-4">
              <div className="flex gap-2">
                {Object.values(VESTING_PROTOCOL).map((id) => {
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setProtocol(id);
                        if (id === VESTING_PROTOCOL.SABLIER_V2) setNftInput(contracts.sablierV2Lockup);
                      }}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg border text-[10px] uppercase transition-colors',
                        protocol === id
                          ? 'bg-[#1D9E75]/20 border-[#1D9E75] text-[#E8E6DF]'
                          : 'bg-white/5 border-white/10 text-[#9C9A92] hover:bg-white/10'
                      )}
                    >
                      {VESTING_PROTOCOL_LABELS[id]}
                    </button>
                  );
                })}
              </div>
              <input
                value={nftInput}
                onChange={e => setNftInput(e.target.value.trim())}
                placeholder="Stream NFT contract (0x...)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[#E8E6DF] font-mono text-xs"
              />
            </div>

            <StreamSelector
              address={address}
              selected={selectedStream}
              onSelect={(id: number) => {
                setSelectedStream(id);
                setStep('approve-operator');
              }}
            />
          </GlassCard>

          {/* Step 2: Approve NFT */}
          {(step === 'approve-operator' || step === 'review' || step === 'borrow') && (
            <GlassCard>
              <h3 className="text-[#E8E6DF] font-medium mb-2 redaction-text uppercase tracking-tight">
                2. Approve Stream NFT
              </h3>
              <p className="text-[#9C9A92] text-xs mb-4">
                Approve the Vestra VestingAdapter to escrow stream #{selectedStream}. It holds the NFT
                until the loan is repaid, and returns it to you on full repayment.
              </p>
              {owner && !isOwner && (
                <p className="text-amber-400/80 text-xs mb-3">This wallet does not own stream #{selectedStream}.</p>
              )}
              {whitelisted === false && (
                <p className="text-amber-400/80 text-xs mb-3">
                  This NFT contract is not whitelisted for {VESTING_PROTOCOL_LABELS[protocol]} on VestingAdapter.
                </p>
              )}
              {sablierBlocked && (
                <p className="text-amber-400/80 text-xs mb-3">
                  Cancelable or canceled Sablier streams cannot be used as collateral.
                </p>
              )}
              <TxButton
                onClick={handleApproveNft}
                loading={approvePending}
                success={isApproved}
                successMessage="NFT Approved"
                disabled={selectedStream === null || !nftContract || (!!owner && !isOwner)}
                onSuccess={() => setStep('review')}
              >
                Approve NFT
              </TxButton>
            </GlassCard>
          )}

          {/* Step 3: Review + Borrow */}
          {(step === 'review' || step === 'borrow') && isApproved && (
            <GlassCard>
              <h3 className="text-[#E8E6DF] font-medium mb-4 redaction-text uppercase tracking-tight">
                3. Loan Terms
              </h3>

              <div className="space-y-4 mb-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[#9C9A92] text-sm">Amount (USDC)</label>
                    <span className="text-[#5F5E5A] text-xs">Max: {formatUsd(maxBorrowVal)}</span>
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
                          // Round down so the request never exceeds the on-chain max.
                          const amount = Math.floor(maxBorrowVal * (pct / 100) * 100) / 100;
                          setRequestAmount(amount > 0 ? amount.toFixed(2) : '0.00');
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#9C9A92] text-[10px] uppercase hover:bg-white/10 transition-colors"
                      >
                        {pct === 100 ? 'Max' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                  {belowMinimum && (
                    <p className="text-amber-400/80 text-[10px] mt-2">Minimum borrow is {formatUsd(Number(formatUnits(minBorrowRaw, 6)))}.</p>
                  )}
                  {aboveMax && (
                    <p className="text-amber-400/80 text-[10px] mt-2">Amount exceeds the max borrow for this stream.</p>
                  )}
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-[#9C9A92] text-sm">Maturity</label>
                    <span className="text-[#E8E6DF] text-xs font-mono">
                      {maturityDays === null ? `At unlock (${daysRemaining}d)` : `${maturityDays}d`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max={Math.max(1, daysRemaining)}
                    step="1"
                    value={maturityDays ?? Math.max(1, daysRemaining)}
                    onChange={e => {
                      const d = Number(e.target.value);
                      setMaturityDays(d >= daysRemaining ? null : d);
                    }}
                    disabled={daysRemaining <= 1}
                    className="w-full accent-[#1D9E75]"
                  />
                  <p className="text-[10px] text-[#5F5E5A] mt-1">
                    Repay any time before maturity. After maturity plus the grace period the loan can be liquidated.
                  </p>
                </div>
              </div>

              <TxButton
                onClick={handleBorrow}
                loading={loanPending}
                success={loanSuccess}
                disabled={requestRaw === 0n || belowMinimum || aboveMax || sablierBlocked}
                successMessage="Loan Originated!"
              >
                Draw Loan
              </TxButton>
              {borrowError && (
                <p className="text-amber-400/80 text-[10px] mt-2 break-words">
                  {(borrowError as { shortMessage?: string }).shortMessage ?? borrowError.message}
                </p>
              )}
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
                  {formatUsd(parseFloat(requestAmount))} USDC borrowed (minus the origination fee).
                </p>
                <a
                  href="/repay"
                  className="mt-4 inline-block text-[#5DCAA5] text-sm border border-[#5DCAA5]/30 rounded-lg px-4 py-2 hover:bg-[#5DCAA5]/10 transition-colors"
                >
                  Manage Loan →
                </a>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Right: Stream Info + dDPV */}
        <div className="space-y-4">
          {selectedStream !== null && nftContract && (
            <>
              <GlassCard>
                <h3 className="text-[#9C9A92] text-sm mb-4 uppercase tracking-wider redaction-text">
                  Stream Details
                </h3>
                {stream.isError ? (
                  <p className="text-amber-400/80 text-xs">
                    Could not read stream #{selectedStream} as a {VESTING_PROTOCOL_LABELS[protocol]} position.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <InfoRow label="Stream ID"    value={`#${selectedStream}`} mono />
                    <InfoRow label="Protocol"     value={VESTING_PROTOCOL_LABELS[protocol]} />
                    <InfoRow label="Token"        value={stream.token ? formatAddress(stream.token) : '—'} mono />
                    <InfoRow label="Locked Amount" value={`${parseFloat(streamTotal).toLocaleString()} tokens`} />
                    <InfoRow
                      label="Unlocks In"
                      value={`${daysRemaining} days`}
                      status={daysRemaining > 365 ? 'warning' : 'normal'}
                    />
                  </div>
                )}
              </GlassCard>

              {stream.token && (
                <DpvDisplay
                  quantity={stream.quantity}
                  token={stream.token}
                  unlockTime={stream.unlockTime}
                  nftContract={nftContract}
                  contracts={contracts}
                  onMaxBorrow={setMaxBorrowVal}
                />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
