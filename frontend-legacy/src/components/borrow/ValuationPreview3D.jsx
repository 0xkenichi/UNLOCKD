// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import { useRef } from 'react';
import HoloCard from '../common/HoloCard.jsx';

// A sub-component to handle grouped rotation of paths
function RiskPathsGroup({ paths }) {
  const groupRef = useRef();

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
  });

  return (
    <group ref={groupRef} position={[-2, -1, 0]}>
      {paths.map((path, index) => (
        <Line
          key={index}
          points={path.map(p => [p[0] * 4, p[1] * 2, (index - paths.length / 2) * 0.1])} // Space them out in 3D
          color={index < 5 ? '#b2564b' : '#c4a26c'}
          lineWidth={1.5}
          opacity={index < 5 ? 1 : 0.3}
          transparent
        />
      ))}
    </group>
  );
}

export default function ValuationPreview3D({ paths = [] }) {
  const isReady = paths && paths.length > 0;

  return (
    <HoloCard distort={0.4}>
      <div className="section-head mb-4">
        <div>
          <h3 className="section-title holo-glow">Risk Simulation</h3>
          <div className="section-subtitle">Health of a loan at max LTV until unlock, on simulated prices at an assumed 100% annual volatility. A path that falls below 1 is liquidated.</div>
        </div>
        <span className="chip">3D Active</span>
      </div>

      <div className="w-full relative overflow-hidden" style={{ height: 250, border: '1px solid var(--border-secondary)', background: 'var(--surface-soft)' }}>
        {!isReady && (
          <div className="flex items-center justify-center muted" style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
            Awaiting collateral assessment...
          </div>
        )}
        <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
          <ambientLight intensity={0.8} />
          {isReady && <RiskPathsGroup paths={paths} />}
          <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 1.5} />
        </Canvas>
      </div>

      <div className="flex justify-between muted" style={{ marginTop: 16, gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
        <div className="flex items-center gap-2">
          <div className="rounded-full" style={{ width: 8, height: 8, background: 'var(--danger-500)' }}></div>
          <span>Worst 5% of paths</span>
        </div>
        <div>
          Paths simulated: {paths.length}
        </div>
      </div>
    </HoloCard>
  );
}
