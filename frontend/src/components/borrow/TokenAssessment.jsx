// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import { useChainId, usePublicClient, useReadContract } from 'wagmi';
import { formatValue } from '../../utils/format.js';
import {
  erc20Abi,
  getContractAddress,
  testnetPriceFeedAbi
} from '../../utils/contracts.js';

const TESTNET_CHAIN_IDS = new Set([31337, 11155111, 84532]);

const formatUsd = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : '0.00';

export default function TokenAssessment({ vestingDetails, ltvBps, onEstimate }) {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const isTestnet = TESTNET_CHAIN_IDS.has(chainId);

  const tokenAddr = vestingDetails?.tokenAddress;
  const tokenDecimals = Number(vestingDetails?.tokenDecimals ?? 18);
  const quantityRaw = vestingDetails?.quantity ? BigInt(vestingDetails.quantity) : 0n;
  const quantity = useMemo(() => {
    if (!quantityRaw || !Number.isFinite(tokenDecimals)) return 0;
    const parsed = Number(formatValue(quantityRaw, tokenDecimals));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [quantityRaw, tokenDecimals]);

  const unlockLabel = useMemo(() => {
    if (!vestingDetails?.unlockTime) return '--';
    const date = new Date(Number(vestingDetails.unlockTime) * 1000);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
  }, [vestingDetails]);

  const { data: tokenSymbol } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'symbol',
    query: { enabled: Boolean(tokenAddr) }
  });
  const { data: tokenName } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'name',
    query: { enabled: Boolean(tokenAddr) }
  });

  const [livePrice, setLivePrice] = useState(0);
  const [feedStatus, setFeedStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadOraclePrice = async () => {
      if (!isTestnet) {
        setLivePrice(0);
        setFeedStatus('Token assessment uses live oracle reads on testnet only.');
        return;
      }
      const oracleAddress = getContractAddress(chainId, 'testnetPriceFeed');
      if (!oracleAddress) {
        setLivePrice(0);
        setFeedStatus('No oracle configured for this testnet.');
        return;
      }
      if (!publicClient) {
        setLivePrice(0);
        setFeedStatus('Wallet client unavailable.');
        return;
      }
      try {
        setFeedStatus('Reading testnet oracle...');
        const [decimals, roundData] = await Promise.all([
          publicClient.readContract({
            address: oracleAddress,
            abi: testnetPriceFeedAbi,
            functionName: 'decimals'
          }),
          publicClient.readContract({
            address: oracleAddress,
            abi: testnetPriceFeedAbi,
            functionName: 'latestRoundData'
          })
        ]);
        const price = Number(roundData[1]) / 10 ** Number(decimals);
        if (!cancelled && Number.isFinite(price) && price > 0) {
          setLivePrice(price);
          setFeedStatus('Oracle price loaded from testnet.');
        } else if (!cancelled) {
          setLivePrice(0);
          setFeedStatus('Oracle returned an invalid value.');
        }
      } catch {
        if (!cancelled) {
          setLivePrice(0);
          setFeedStatus('Oracle read failed.');
        }
      }
    };
    loadOraclePrice();
    return () => {
      cancelled = true;
    };
  }, [chainId, isTestnet, publicClient]);

  const collateralValue = quantity * livePrice;
  const maxLoan = collateralValue * (Number(ltvBps || 0) / 10000);

  useEffect(() => {
    if (!onEstimate) return;
    onEstimate({
      maxLoan,
      adjustedPrice: livePrice,
      haircut: livePrice > 0 ? 1 : 0,
      coverageP1: 0,
      coverageP5: 0,
      p1AdjPrice: 0,
      p5AdjPrice: 0
    });
  }, [onEstimate, maxLoan, livePrice]);

  const tokenLabel = useMemo(() => {
    if (!tokenAddr) return '--';
    if (tokenSymbol || tokenName) {
      const sym = tokenSymbol || tokenName || '—';
      const name = tokenName && tokenName !== tokenSymbol ? tokenName : '';
      return name ? `${sym} (${name})` : String(sym);
    }
    return `${tokenAddr.slice(0, 6)}…${tokenAddr.slice(-4)}`;
  }, [tokenAddr, tokenSymbol, tokenName]);

  const hasInputs =
    Boolean(vestingDetails?.collateralId) &&
    Boolean(vestingDetails?.vestingContract) &&
    Boolean(tokenAddr) &&
    quantity > 0;

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Token Assessment</h3>
          <div className="section-subtitle">
            Derived from collateral ID + vesting contract using testnet oracle data.
          </div>
        </div>
        <span className="chip">Oracle</span>
      </div>
      {!hasInputs && (
        <div className="muted" style={{ marginBottom: 16 }}>
          Enter collateral ID and vesting contract in Borrow Actions to assess real token data.
        </div>
      )}
      <div className="data-table" style={{ marginBottom: 16 }}>
        <div className="table-row header">
          <div>Collateral ID</div>
          <div>Vesting Contract</div>
          <div>Token</div>
          <div>Unlock</div>
        </div>
        <div className="table-row">
          <div>{vestingDetails?.collateralId || '--'}</div>
          <div>{vestingDetails?.vestingContract || '--'}</div>
          <div>{tokenLabel}</div>
          <div>{unlockLabel}</div>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Vesting Amount</div>
          <div className="stat-value">
            {quantity ? quantity.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '--'}
          </div>
          <div className="stat-delta">{tokenSymbol || ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Oracle Price</div>
          <div className="stat-value">${formatUsd(livePrice)}</div>
          <div className="stat-delta">Testnet feed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Collateral Value</div>
          <div className="stat-value">${formatUsd(collateralValue)}</div>
          <div className="stat-delta">Quantity x price</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Max Loan</div>
          <div className="stat-value">${formatUsd(maxLoan)}</div>
          <div className="stat-delta">Using on-chain LTV</div>
        </div>
      </div>
      {feedStatus && <div className="muted">{feedStatus}</div>}
    </div>
  );
}
