import { useNavigate } from 'react-router-dom';

export default function DemoAccessCard() {
  const navigate = useNavigate();

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Demo Access</h3>
          <div className="section-subtitle">
            Testnet-only onboarding for external users.
          </div>
        </div>
        <span className="chip">Testnet</span>
      </div>
      <div className="card-list" style={{ marginBottom: 12 }}>
        <div className="pill">Base Sepolia preferred</div>
        <div className="pill">No real funds</div>
        <div className="pill">Wallet + faucet + vesting</div>
      </div>
      <div className="inline-actions">
        <button
          className="button ghost"
          type="button"
          onClick={() => navigate('/docs?doc=testnet-faucet')}
        >
          Faucet guide
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => navigate('/docs?doc=vesting-quickstart')}
        >
          Create vesting
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => navigate('/docs?doc=tokenomics')}
        >
          Tokenomics
        </button>
      </div>
    </div>
  );
}

