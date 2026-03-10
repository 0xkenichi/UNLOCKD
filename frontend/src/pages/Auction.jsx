// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useReadContract, useChainId } from 'wagmi';
import { formatUnits } from 'viem';
import AuctionTypeSelector from '../components/auction/AuctionTypeSelector.jsx';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import { CONTRACTS, loanManagerAbi } from '../utils/contracts.js';

export default function Auction() {
  const navigate = useNavigate();
  const chainId = useChainId();
  const { address } = useAccount();
  const contracts = CONTRACTS[chainId] || {};

  // 1. Fetch Global Loan Count (as a proxy for protocol activity)
  const { data: loanCount } = useReadContract({
    address: contracts.loanManager,
    abi: loanManagerAbi,
    functionName: 'loanCount',
    query: { enabled: !!contracts.loanManager }
  });

  // 2. Logic for scanning OTC Buybacks would ideally be an indexer call.
  // For the MVP UI, we show a placeholder for "My Buybacks" if the user has an active liquidation.
  const [isScanning, setIsScanning] = useState(false);

  const scrollTo = (id) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Auction</h1>
        <div className="page-subtitle">
          Monitor distressed debt and execute OTC buybacks for quarantined collateral.
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/features')}>
            Liquidation framework
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=whitepaper')}>
            Read whitepaper
          </button>
          <button className="button ghost" onClick={() => setIsScanning(true)}>
            {isScanning ? 'Scanning...' : 'Scan for Buybacks'}
          </button>
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">OTC Buybacks</h3>
              <div className="section-subtitle">Privileged acquisition of distressed vesting assets</div>
            </div>
            <span className="tag">Live Monitoring</span>
          </div>
          <p className="muted">
            Assets entering "Quarantine" from failed auctions are available for OTC buyback
            by designated token treasuries at a fixed 20% discount.
          </p>
          <div className="card-list">
            <div className="pill">7-day quarantine window</div>
            <div className="pill">Automated deficit covering</div>
            <div className="pill">Whitelist-only execution</div>
          </div>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Active Buybacks</div>
          <div className="stat-value">0</div>
          <div className="stat-delta">Searching...</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Protocol Loans</div>
          <div className="stat-value">{loanCount?.toString() || '0'}</div>
          <div className="stat-delta">Total minted</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Recovery</div>
          <div className="stat-value">92%</div>
          <div className="stat-delta">Simulated</div>
        </div>
      </div>
      <AuctionTypeSelector />

      <div className="holo-card" id="auction-pipeline">
        <div className="section-head">
          <div>
            <h3 className="section-title">Liquidation Pipeline</h3>
            <div className="section-subtitle">Real-time status of distressed positions</div>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() =>
              window.open('https://vestra.finance/alerts')
            }
          >
            Audit Logs
          </button>
        </div>
        <div className="data-table">
          <div className="table-row header">
            <div>Position</div>
            <div>Asset</div>
            <div>Phase</div>
            <div>Status</div>
          </div>
          <div className="table-row">
            <div>Sealed Bid #001</div>
            <div className="asset-cell">
              <span className="asset-icon crdt" />
              CRDT
            </div>
            <div>Auction Ready</div>
            <div className="tag">Queued</div>
          </div>
          <div className="table-row">
            <div>Dutch Round #2</div>
            <div className="asset-cell">
              <span className="asset-icon eth" />
              ETH
            </div>
            <div>Descending</div>
            <div className="tag warn">Active</div>
          </div>
        </div>
      </div>
    </div>
  );
}

