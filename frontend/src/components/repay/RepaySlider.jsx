import { useState } from 'react';
import { trackEvent } from '../../utils/analytics.js';

export default function RepaySlider() {
  const [amount, setAmount] = useState(45);
  const [saved, setSaved] = useState(false);
  const [simulated, setSimulated] = useState(false);

  const handleSave = () => {
    const payload = {
      amount,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('vestra-repay-scenario', JSON.stringify(payload));
    trackEvent('repay_scenario_saved', { amountPct: amount });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleSimulate = () => {
    trackEvent('repay_scenario_simulated', { amountPct: amount });
    setSimulated(true);
    setTimeout(() => setSimulated(false), 1500);
  };

  const releaseLabel = amount >= 100 ? 'Full collateral release' : amount >= 70 ? 'Mostly released' : 'Partial release';
  const seizeRisk = Math.max(0, 100 - amount);

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Settlement Simulator</h3>
          <div className="section-subtitle">
            Demo-only preview of seize vs release paths.
          </div>
        </div>
        <span className="chip">Demo only</span>
      </div>
      <div className="slider-row">
        <input
          className="slider"
          type="range"
          min="0"
          max="100"
          value={amount}
          aria-label="Repay percentage simulator"
          onChange={(event) => setAmount(Number(event.target.value))}
        />
        <span className="chip">{amount}% repay</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${amount}%` }} />
      </div>
      <div className="progress-meta">
        <span>{releaseLabel}</span>
        <span>{seizeRisk}% still exposed to settlement risk</span>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        This tool is illustrative and does not execute onchain repayments.
      </div>
      <div className="inline-actions">
        <button className="button" type="button" onClick={handleSimulate}>
          {simulated ? 'Simulated' : 'Simulate'}
        </button>
        <button className="button ghost" type="button" onClick={handleSave}>
          {saved ? 'Saved' : 'Save Scenario'}
        </button>
      </div>
    </div>
  );
}
