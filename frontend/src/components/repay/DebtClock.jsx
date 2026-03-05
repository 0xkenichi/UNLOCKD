// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Canvas } from '@react-three/fiber';
import HoloCard from '../common/HoloCard.jsx';

export default function DebtClock() {
  const handleRepay = () => {
    const target = document.getElementById('repay-actions');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <HoloCard distort={0.3}>
      <div className="section-head">
        <div>
          <h3 className="section-title">Debt Clock</h3>
          <div className="section-subtitle">
            Accrued interest ticks until settlement.
          </div>
        </div>
        <span className="chip">Live</span>
      </div>
      <Canvas className="holo-canvas">
        <ambientLight intensity={0.7} />
        <mesh rotation={[0.2, 0, 0]}>
          <torusGeometry args={[1.1, 0.25, 32, 64]} />
          <meshStandardMaterial color="#C0C0C0" emissive="#1f3b5a" />
        </mesh>
      </Canvas>
      <button className="button" type="button" onClick={handleRepay}>
        Repay Partial
      </button>
    </HoloCard>
  );
}
