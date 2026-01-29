import { useState } from 'react';

export default function RepaySlider() {
  const [amount, setAmount] = useState(45);

  return (
    <div className="holo-card">
      <h3 className="holo-title">Settlement Simulator</h3>
      <div className="muted">
        Preview seize vs release paths at unlock time.
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
        <span className="pill">{amount}% repay</span>
      </div>
      <div className="muted">
        Estimated release: {amount >= 70 ? 'Full' : 'Partial'} collateral
      </div>
      <button className="button">Simulate</button>
    </div>
  );
}
