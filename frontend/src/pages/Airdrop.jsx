import { useNavigate } from 'react-router-dom';
import { trackEvent } from '../utils/analytics.js';

export default function Airdrop() {
  const navigate = useNavigate();

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Airdrop Program</h1>
        <div className="page-subtitle">
          Testnet participation is tracked. Airdrop details will be finalized before mainnet.
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Airdrop Allocation</div>
          <div className="stat-value">3%</div>
          <div className="stat-delta">Protocol token supply</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Testnet Allocation</div>
          <div className="stat-value">2%</div>
          <div className="stat-delta">Across phase 1 + phase 2</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Bug Bounty Pool</div>
          <div className="stat-value">0.5%</div>
          <div className="stat-delta">For valid bug reports</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="holo-card">
          <h3 className="section-title">How qualification works</h3>
          <p className="muted">
            Wallet-linked actions performed in the app are logged for testnet scoring. Focus on
            real usage: onboarding, borrow/repay flows, and ecosystem participation.
          </p>
          <div className="card-list">
            <div className="pill">Connect wallet and complete onboarding</div>
            <div className="pill">Use core borrowing and repayment actions</div>
            <div className="pill">Submit product feedback with wallet or email</div>
            <div className="pill">Join community channels (Discord announcements soon)</div>
          </div>
        </div>
        <div className="holo-card">
          <h3 className="section-title">Status</h3>
          <p className="muted">
            Public eligibility formulas and snapshots are intentionally withheld during phase 1 to
            reduce gaming. Final distribution mechanics will be announced before token generation.
          </p>
          <div className="inline-actions">
            <button
              className="button"
              type="button"
              onClick={() => {
                trackEvent('airdrop_feedback_click');
                navigate('/feedback');
              }}
            >
              Share feedback
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                trackEvent('airdrop_docs_click');
                navigate('/docs');
              }}
            >
              Read docs
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={() => navigate('/admin/airdrop')}
            >
              Team leaderboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
