import { useState } from 'react';

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
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleSimulate = () => {
    setSimulated(true);
    setTimeout(() => setSimulated(false), 1500);
  };

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Settlement Simulator</h3>
          <div className="section-subtitle">
            Preview seize vs release paths.
          </div>
        </div>
        <span className="chip">What-if</span>
      </div>
      <div className="slider-row">
        <input
          className="slider"
          type="range"
          min="0"
          max="100"
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
        />
        <span className="chip">{amount}% repay</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${amount}%` }} />
      </div>
      <div className="progress-meta">
        <span>Release</span>
        <span>{amount >= 70 ? 'Full' : 'Partial'} collateral</span>
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
