import { useEffect, useMemo, useState } from 'react';
import { useChainId, useReadContract } from 'wagmi';
import {
  getContractAddress,
  valuationEngineAbi
} from '../../utils/contracts.js';
import { formatValue, toUnits } from '../../utils/format.js';

const DEFAULT_TOKEN = '0x0000000000000000000000000000000000000000';

const formatLocalDateTime = (timestampSeconds) => {
  if (!timestampSeconds) return '';
  const date = new Date(timestampSeconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function ValuationForm({ onUpdate, prefill }) {
  const chainId = useChainId();
  const valuationEngine = getContractAddress(chainId, 'valuationEngine');
  const [quantity, setQuantity] = useState('1000');
  const [tokenDecimals, setTokenDecimals] = useState('18');
  const [unlockDate, setUnlockDate] = useState('');
  const [tokenAddress, setTokenAddress] = useState(DEFAULT_TOKEN);

  const unlockTime = useMemo(() => {
    if (!unlockDate) return null;
    const timestamp = Math.floor(new Date(unlockDate).getTime() / 1000);
    return Number.isNaN(timestamp) ? null : timestamp;
  }, [unlockDate]);

  const quantityUnits = useMemo(() => {
    const decimals = Number(tokenDecimals || 18);
    return toUnits(quantity, decimals);
  }, [quantity, tokenDecimals]);

  const { data: valuationData } = useReadContract({
    address: valuationEngine,
    abi: valuationEngineAbi,
    functionName: 'computeDPV',
    args: [
      quantityUnits || 0n,
      tokenAddress || DEFAULT_TOKEN,
      unlockTime || 0
    ],
    query: {
      enabled: Boolean(valuationEngine && quantityUnits && unlockTime)
    }
  });

  const pv = valuationData?.[0] ?? 0n;
  const ltvBps = valuationData?.[1] ?? 0n;
  const maxBorrow = pv * ltvBps / 10000n;
  const ltvPercent = Number(ltvBps) ? (Number(ltvBps) / 100).toFixed(2) : '0.00';

  useEffect(() => {
    if (onUpdate) {
      onUpdate({ pv, ltvBps });
    }
  }, [pv, ltvBps, onUpdate]);

  useEffect(() => {
    if (!prefill) return;
    const nextTokenDecimals =
      prefill.tokenDecimals !== undefined && prefill.tokenDecimals !== null
        ? String(prefill.tokenDecimals)
        : tokenDecimals;
    const quantityDecimals = Number(nextTokenDecimals || 18);
    const nextQuantity =
      prefill.quantity !== undefined && prefill.quantity !== null
        ? formatValue(prefill.quantity, quantityDecimals)
        : '';
    const nextTokenAddress = prefill.tokenAddress || tokenAddress;
    const nextUnlockDate =
      prefill.unlockTime !== undefined && prefill.unlockTime !== null
        ? formatLocalDateTime(Number(prefill.unlockTime))
        : '';

    if (nextQuantity && nextQuantity !== quantity) {
      setQuantity(nextQuantity);
    }
    if (nextTokenDecimals && nextTokenDecimals !== tokenDecimals) {
      setTokenDecimals(nextTokenDecimals);
    }
    if (nextTokenAddress && nextTokenAddress !== tokenAddress) {
      setTokenAddress(nextTokenAddress);
    }
    if (nextUnlockDate && nextUnlockDate !== unlockDate) {
      setUnlockDate(nextUnlockDate);
    }
  }, [prefill, quantity, tokenAddress, tokenDecimals, unlockDate]);

  return (
    <div className="holo-card">
      <h3 className="holo-title">Valuation Engine</h3>
      <p className="muted">Live DPV + LTV from on-chain risk model.</p>
      <div className="form-grid">
        <label className="form-field">
          Quantity
          <input
            className="form-input"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Token Decimals
          <input
            className="form-input"
            value={tokenDecimals}
            onChange={(event) => setTokenDecimals(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="form-field">
          Unlock Date
          <input
            className="form-input"
            type="datetime-local"
            value={unlockDate}
            onChange={(event) => setUnlockDate(event.target.value)}
          />
        </label>
        <label className="form-field">
          Token Address
          <input
            className="form-input"
            value={tokenAddress}
            onChange={(event) => setTokenAddress(event.target.value)}
          />
        </label>
      </div>
      <div className="stack">
        <div className="pill">PV (raw): {pv.toString()}</div>
        <div className="pill">LTV: {ltvPercent}%</div>
        <div className="pill">Max Borrow (raw): {maxBorrow.toString()}</div>
      </div>
    </div>
  );
}
