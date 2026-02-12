import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiPost } from '../utils/api.js';

export default function FundraiseOnboard() {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [chain, setChain] = useState('base');
  const [token, setToken] = useState('');
  const [treasury, setTreasury] = useState('');
  const [vestingPolicyRef, setVestingPolicyRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [linked, setLinked] = useState(null);

  const handleLink = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { source } = await apiPost('/api/fundraising/link', {
        projectId: projectId.trim(),
        chain: chain.trim() || 'base',
        token: token.trim() || undefined,
        treasury: treasury.trim() || undefined,
        vestingPolicyRef: vestingPolicyRef.trim() || undefined
      });
      setLinked(source);
    } catch (err) {
      setError(err?.message || 'Failed to link project');
    } finally {
      setLoading(false);
    }
  };

  const goToBorrow = () => {
    navigate('/borrow', {
      state: {
        prefill: {
          fromFundraise: true,
          projectId: linked?.projectId || projectId,
          chain: linked?.chain || chain,
          vestingPolicyRef: linked?.vestingPolicyRef || vestingPolicyRef
        }
      }
    });
  };

  return (
    <motion.div
      className="stack page-minimal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="page-header">
        <h1 className="page-title holo-glow">Fundraising project</h1>
        <p className="page-subtitle">
          Link a fundraising project (e.g. Juicebox) to a vesting route, then bring allocations into Borrow.
        </p>
      </div>

      <div className="holo-card">
        <div className="section-head">
          <h3 className="section-title">Link project</h3>
          <div className="section-subtitle">
            Register your project so you can define a vesting distribution and send contributors to Borrow.
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {linked ? (
          <div className="stack">
            <div className="data-table">
              <div className="table-row header">
                <div>Field</div>
                <div>Value</div>
              </div>
              <div className="table-row">
                <div>Project ID</div>
                <div>{linked.projectId}</div>
              </div>
              <div className="table-row">
                <div>Chain</div>
                <div>{linked.chain}</div>
              </div>
              {linked.token && (
                <div className="table-row">
                  <div>Token</div>
                  <div>{linked.token}</div>
                </div>
              )}
              {linked.vestingPolicyRef && (
                <div className="table-row">
                  <div>Vesting policy ref</div>
                  <div>{linked.vestingPolicyRef}</div>
                </div>
              )}
            </div>
            <p className="muted">
              Next: set up vesting for your allocations (e.g. via Sablier or our scripts), then use Borrow to escrow and get USDC.
            </p>
            <div className="inline-actions">
              <button type="button" className="button" onClick={goToBorrow}>
                Continue to Borrow
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => setLinked(null)}
              >
                Link another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLink} className="stack">
            <div className="form-grid">
              <label className="form-field">
                Project ID
                <input
                  className="form-input"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="e.g. Juicebox project ID or slug"
                  required
                />
              </label>
              <label className="form-field">
                Chain
                <select
                  className="form-input"
                  value={chain}
                  onChange={(e) => setChain(e.target.value)}
                >
                  <option value="base">Base</option>
                  <option value="sepolia">Sepolia</option>
                  <option value="baseSepolia">Base Sepolia</option>
                  <option value="arbitrum">Arbitrum</option>
                  <option value="avalanche">Avalanche</option>
                </select>
              </label>
              <label className="form-field">
                Token address (optional)
                <input
                  className="form-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label className="form-field">
                Treasury address (optional)
                <input
                  className="form-input"
                  value={treasury}
                  onChange={(e) => setTreasury(e.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label className="form-field full-width">
                Vesting policy ref (optional)
                <input
                  className="form-input"
                  value={vestingPolicyRef}
                  onChange={(e) => setVestingPolicyRef(e.target.value)}
                  placeholder="e.g. sablier-v2, or wrapper contract address"
                />
              </label>
            </div>
            <div className="inline-actions">
              <button type="submit" className="button" disabled={loading}>
                {loading ? 'Linking…' : 'Link project'}
              </button>
            </div>
          </form>
        )}
      </div>
    </motion.div>
  );
}
