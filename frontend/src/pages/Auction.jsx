import AuctionTypeSelector from '../components/auction/AuctionTypeSelector.jsx';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';

export default function Auction() {
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
          Claims auction module is planned and not live on testnet.
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration variant="auction" />
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Active Auctions</div>
          <div className="stat-value">0</div>
          <div className="stat-delta">Testnet only</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Discount</div>
          <div className="stat-value">—</div>
          <div className="stat-delta">No bids</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Liquidations</div>
          <div className="stat-value">—</div>
          <div className="stat-delta">Awaiting activation</div>
        </div>
      </div>
      <AuctionTypeSelector />
      <div className="holo-card" id="auction-control">
        <h3 className="holo-title">Auction Control</h3>
        <p className="muted">
          Prototype UI for future auctions (no on-chain execution yet).
        </p>
        <button
          className="button"
          type="button"
          onClick={() => scrollTo('auction-pipeline')}
        >
          View Pipeline
        </button>
      </div>
      <div className="holo-card" id="auction-pipeline">
        <div className="section-head">
          <div>
            <h3 className="section-title">Auction Pipeline</h3>
            <div className="section-subtitle">Upcoming collateral claims</div>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() =>
              window.open('mailto:0xkenichi@gmail.com?subject=Auction%20alerts')
            }
          >
            Notify Me
          </button>
        </div>
        <div className="data-table">
          <div className="table-row header">
            <div>Collateral</div>
            <div>Unlock</div>
            <div>Reserve</div>
            <div>Status</div>
          </div>
          <div className="table-row">
            <div className="asset-cell">
              <span className="asset-icon crdt" />
              CRDT Vault
            </div>
            <div>Jun 10</div>
            <div>$18,200</div>
            <div className="tag">Queued</div>
          </div>
          <div className="table-row">
            <div className="asset-cell">
              <span className="asset-icon arb" />
              ARB Vault
            </div>
            <div>Jul 02</div>
            <div>$9,450</div>
            <div className="tag">Monitoring</div>
          </div>
        </div>
      </div>
    </div>
  );
}
