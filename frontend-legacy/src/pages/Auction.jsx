// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import { formatUnits } from 'viem';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import TxStatusBanner from '../components/common/TxStatusBanner.jsx';
import {
  getContractAddress,
  LOAN_STATUS,
  LOAN_STATUS_LABELS,
  loanManagerAbi,
  usdcAbi
} from '../utils/contracts.js';

const USDC_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const SCAN_WINDOW = 25;

const formatUsdc = (value) => {
  if (value === null || value === undefined) return '--';
  const asNumber = Number(formatUnits(BigInt(value), USDC_DECIMALS));
  if (!Number.isFinite(asNumber)) return '--';
  return asNumber.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const txStatus = (confirmed, mining, pending) =>
  confirmed ? 'Confirmed' : mining ? 'Confirming' : pending ? 'Pending' : '';

export default function Auction() {
  const navigate = useNavigate();
  const chainId = useChainId();
  const { address } = useAccount();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');
  const [loanId, setLoanId] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(timer);
  }, []);

  const { data: nextLoanId } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'nextLoanId',
    query: { enabled: Boolean(loanManager) }
  });
  const totalLoans = nextLoanId && nextLoanId > 0n ? nextLoanId - 1n : 0n;

  // Scan the most recent loans for liquidatable positions and live auctions.
  const scanIds = useMemo(() => {
    const ids = [];
    for (let id = totalLoans; id >= 1n && ids.length < SCAN_WINDOW; id -= 1n) ids.push(id);
    return ids;
  }, [totalLoans]);

  const { data: scanBatch, refetch: refetchScan } = useReadContracts({
    contracts: loanManager
      ? scanIds.flatMap((id) => [
        { address: loanManager, abi: loanManagerAbi, functionName: 'getLoan', args: [id] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'isLiquidatable', args: [id] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'debtOf', args: [id] }
      ])
      : [],
    query: { enabled: Boolean(loanManager && scanIds.length), refetchInterval: 30000 }
  });

  const distressed = useMemo(() => {
    if (!scanBatch) return [];
    return scanIds
      .map((id, i) => {
        const loan = scanBatch[i * 3]?.result;
        const liquidatable = scanBatch[i * 3 + 1]?.result;
        const debt = scanBatch[i * 3 + 2]?.result;
        return { id, loan, liquidatable: Boolean(liquidatable), debt };
      })
      .filter(({ loan, liquidatable }) => {
        if (!loan) return false;
        const status = Number(loan.status);
        return status === LOAN_STATUS.AUCTION || (status === LOAN_STATUS.ACTIVE && liquidatable);
      });
  }, [scanBatch, scanIds]);

  const loanIdValid = /^\d+$/.test(loanId) && BigInt(loanId) > 0n;
  const loanIdBig = loanIdValid ? BigInt(loanId) : 0n;

  const { data: loanBatch, refetch: refetchLoan } = useReadContracts({
    contracts: loanManager && loanIdValid
      ? [
        { address: loanManager, abi: loanManagerAbi, functionName: 'getLoan', args: [loanIdBig] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'isLiquidatable', args: [loanIdBig] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'debtOf', args: [loanIdBig] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'auctions', args: [loanIdBig] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'currentPrice', args: [loanIdBig] }
      ]
      : [],
    query: { enabled: Boolean(loanManager && loanIdValid), refetchInterval: 10000 }
  });
  const readOk = (row) => (row?.status === 'success' ? row.result : undefined);
  const loan = readOk(loanBatch?.[0]);
  const liquidatable = Boolean(readOk(loanBatch?.[1]));
  const debt = readOk(loanBatch?.[2]);
  const auction = readOk(loanBatch?.[3]);
  const currentPrice = readOk(loanBatch?.[4]);

  const status = loan ? Number(loan.status) : LOAN_STATUS.NONE;
  const inAuction = status === LOAN_STATUS.AUCTION;
  const auctionStart = auction ? Number(auction[0]) : 0;
  const auctionDuration = auction ? Number(auction[1]) : 0;
  const auctionStartPrice = auction?.[2];
  const auctionFloorPrice = auction?.[3];
  const roundEnded = inAuction && auctionStart > 0 && now >= auctionStart + auctionDuration;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdc || undefined,
    abi: usdcAbi,
    functionName: 'allowance',
    args: [address || ZERO_ADDRESS, loanManager || ZERO_ADDRESS],
    query: { enabled: Boolean(usdc && loanManager && address) }
  });

  const { data: claimable, refetch: refetchClaimable } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'claimable',
    args: [address || ZERO_ADDRESS],
    query: { enabled: Boolean(loanManager && address) }
  });

  const { data: actionHash, writeContract, isPending, error: actionError } = useWriteContract();
  const {
    isLoading: isMining,
    isSuccess: confirmed,
    error: receiptError
  } = useWaitForTransactionReceipt({ hash: actionHash });

  useEffect(() => {
    if (!confirmed) return;
    refetchLoan();
    refetchScan();
    refetchAllowance();
    refetchClaimable();
  }, [confirmed, refetchLoan, refetchScan, refetchAllowance, refetchClaimable]);

  // The Dutch price only decays within a round, so the price read now is an upper bound
  // for the price paid; it is used as the bid's max-price guard and as the approval amount.
  const maxPrice = currentPrice ?? 0n;
  const hasBidAllowance = allowance !== undefined && maxPrice > 0n && allowance >= maxPrice;
  const busy = isPending || isMining;

  const send = (functionName, args) => {
    if (!loanManager) return;
    writeContract({ address: loanManager, abi: loanManagerAbi, functionName, args });
  };

  const handleApproveBid = () => {
    if (!usdc || !loanManager || maxPrice <= 0n) return;
    writeContract({ address: usdc, abi: usdcAbi, functionName: 'approve', args: [loanManager, maxPrice] });
  };

  const error = receiptError || actionError;

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Auction</h1>
        <div className="page-subtitle">
          Liquidate defaulted loans and bid on escrowed vesting streams in a linear Dutch auction.
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/features')}>
            Liquidation framework
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=whitepaper')}>
            Read whitepaper
          </button>
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">How liquidation works</h3>
              <div className="section-subtitle">Permissionless, built into the LoanManager</div>
            </div>
          </div>
          <div className="card-list">
            <div className="pill">A loan is liquidatable after maturity + grace period, or when debt exceeds the liquidation threshold.</div>
            <div className="pill">Anyone can start the auction. Interest stops accruing at that point.</div>
            <div className="pill">Price falls linearly from 120% of spot value to a 10% floor; the buyer pays the price at execution.</div>
            <div className="pill">If a round ends without a bid, anyone can restart it from the floor.</div>
            <div className="pill">The buyer receives the stream NFT and any vested tokens held in escrow; surplus goes to the borrower.</div>
          </div>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Protocol Loans</div>
          <div className="stat-value">{totalLoans.toString()}</div>
          <div className="stat-delta">Total opened</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Distressed (recent {SCAN_WINDOW})</div>
          <div className="stat-value">{distressed.length}</div>
          <div className="stat-delta">Liquidatable or in auction</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Your claimable surplus</div>
          <div className="stat-value">{formatUsdc(claimable)}</div>
          <div className="stat-delta">USDC</div>
        </div>
      </div>

      <div className="holo-card" id="auction-pipeline">
        <div className="section-head">
          <div>
            <h3 className="section-title">Liquidation Pipeline</h3>
            <div className="section-subtitle">Live on-chain status of the most recent loans</div>
          </div>
          <button className="button ghost" type="button" onClick={() => refetchScan()}>
            Refresh
          </button>
        </div>
        {!loanManager && <div className="muted">Vestra contracts are not deployed on this network yet.</div>}
        {loanManager && !distressed.length && (
          <div className="muted">No liquidatable loans or live auctions among the most recent loans.</div>
        )}
        {distressed.length > 0 && (
          <div className="data-table">
            <div className="table-row header">
              <div>Loan</div>
              <div>Debt</div>
              <div>Phase</div>
              <div>Action</div>
            </div>
            {distressed.map(({ id, loan: row, debt: rowDebt }) => (
              <div key={id.toString()} className="table-row">
                <div>#{id.toString()}</div>
                <div>{formatUsdc(rowDebt)} USDC</div>
                <div>{LOAN_STATUS_LABELS[Number(row.status)]}</div>
                <div>
                  <button className="button ghost" type="button" onClick={() => setLoanId(id.toString())}>
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="holo-card" id="auction-control">
        <div className="section-head">
          <div>
            <h3 className="section-title">Auction Control</h3>
            <div className="section-subtitle">Start a liquidation, bid, or restart an expired round</div>
          </div>
          <span className="tag">On-chain</span>
        </div>
        {error && <div className="error-banner">{error.shortMessage || error.message}</div>}
        <TxStatusBanner label="Auction Transaction" hash={actionHash} status={txStatus(confirmed, isMining, isPending)} />
        <div className="form-grid">
          <label className="form-field">
            Loan ID
            <input
              className="form-input"
              value={loanId}
              onChange={(event) => setLoanId(event.target.value.trim())}
              inputMode="numeric"
              placeholder="1"
            />
          </label>
        </div>
        {loan && (
          <div className="data-table">
            <div className="table-row header">
              <div>Status</div>
              <div>Debt</div>
              <div>Current price</div>
              <div>Start / floor</div>
              <div>Round ends</div>
            </div>
            <div className="table-row">
              <div>{LOAN_STATUS_LABELS[status]}{liquidatable && status === LOAN_STATUS.ACTIVE ? ' (liquidatable)' : ''}</div>
              <div>{formatUsdc(debt)} USDC</div>
              <div>{inAuction ? `${formatUsdc(currentPrice)} USDC` : '--'}</div>
              <div>{inAuction ? `${formatUsdc(auctionStartPrice)} / ${formatUsdc(auctionFloorPrice)}` : '--'}</div>
              <div>
                {inAuction && auctionStart
                  ? new Date((auctionStart + auctionDuration) * 1000).toLocaleString()
                  : '--'}
              </div>
            </div>
          </div>
        )}
        <div className="inline-actions">
          <button
            className="button"
            type="button"
            onClick={() => send('startLiquidation', [loanIdBig])}
            disabled={busy || !address || status !== LOAN_STATUS.ACTIVE || !liquidatable}
          >
            Start Liquidation
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={handleApproveBid}
            disabled={busy || !address || !inAuction || maxPrice <= 0n || hasBidAllowance}
          >
            {hasBidAllowance ? 'USDC Approved' : 'Approve USDC for Bid'}
          </button>
          <button
            className="button"
            type="button"
            onClick={() => send('bid', [loanIdBig, maxPrice])}
            disabled={busy || !address || !inAuction || maxPrice <= 0n || !hasBidAllowance}
          >
            Bid {inAuction && maxPrice > 0n ? `(${formatUsdc(maxPrice)} USDC)` : ''}
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={() => send('restartAuction', [loanIdBig])}
            disabled={busy || !address || !roundEnded}
          >
            Restart Auction
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={() => send('claim', [])}
            disabled={busy || !address || !claimable || claimable <= 0n}
          >
            Claim Surplus
          </button>
        </div>
        {loanIdValid && !loan && loanManager && <div className="muted">Loan not found.</div>}
        {inAuction && (
          <div className="muted">
            The bid pays the current price at execution (never more than {formatUsdc(maxPrice)} USDC).
            The borrower can still cancel the auction by repaying the full debt.
          </div>
        )}
      </div>
    </div>
  );
}
