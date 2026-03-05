// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo } from 'react';
import { useChainId, useReadContract } from 'wagmi';
import {
  getContractAddress,
  valuationEngineAbi
} from '../../utils/contracts.js';
import { formatValue } from '../../utils/format.js';

const DEFAULT_TOKEN = '0x0000000000000000000000000000000000000000';

export default function ValuationForm({ onUpdate, prefill }) {
  const chainId = useChainId();
  const valuationEngine = getContractAddress(chainId, 'valuationEngine');
  const tokenAddress = prefill?.tokenAddress || DEFAULT_TOKEN;
  const tokenDecimals = Number(prefill?.tokenDecimals ?? 18);
  const quantityUnits = prefill?.quantity ? BigInt(prefill.quantity) : 0n;
  const unlockTime = prefill?.unlockTime ? Number(prefill.unlockTime) : 0;
  const hasCollateralInputs =
    tokenAddress !== DEFAULT_TOKEN &&
    quantityUnits > 0n &&
    unlockTime > 0;

  const { data: valuationData } = useReadContract({
    address: valuationEngine,
    abi: valuationEngineAbi,
    functionName: 'computeDPV',
    args: [
      quantityUnits,
      tokenAddress,
      unlockTime
    ],
    query: {
      enabled: Boolean(valuationEngine && hasCollateralInputs)
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

  const quantityDisplay = useMemo(() => {
    if (!hasCollateralInputs) return '--';
    return formatValue(quantityUnits, tokenDecimals);
  }, [hasCollateralInputs, quantityUnits, tokenDecimals]);

  const unlockLabel = useMemo(() => {
    if (!unlockTime) return '--';
    const date = new Date(unlockTime * 1000);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
  }, [unlockTime]);

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Valuation Engine</h3>
          <div className="section-subtitle">
            Live DPV + LTV from on-chain collateral details.
          </div>
        </div>
        <span className="chip">DPV</span>
      </div>
      {!hasCollateralInputs && (
        <div className="muted" style={{ marginBottom: 16 }}>
          Enter collateral ID + vesting contract in Borrow Actions to load real on-chain valuation inputs.
        </div>
      )}
      <div className="data-table" style={{ marginBottom: 16 }}>
        <div className="table-row header">
          <div>Collateral ID</div>
          <div>Token</div>
          <div>Quantity</div>
          <div>Unlock</div>
        </div>
        <div className="table-row">
          <div>{prefill?.collateralId || '--'}</div>
          <div>{tokenAddress !== DEFAULT_TOKEN ? tokenAddress : '--'}</div>
          <div>{quantityDisplay}</div>
          <div>{unlockLabel}</div>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Present Value</div>
          <div className="stat-value">{pv.toString()}</div>
          <div className="stat-delta">Raw on-chain PV</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">LTV</div>
          <div className="stat-value">{ltvPercent}%</div>
          <div className="stat-delta">Risk-adjusted</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Max Borrow</div>
          <div className="stat-value">{maxBorrow.toString()}</div>
          <div className="stat-delta">Raw units</div>
        </div>
      </div>
    </div>
  );
}
