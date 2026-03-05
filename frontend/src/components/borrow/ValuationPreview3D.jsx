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
          color={index < 5 ? '#ff3333' : '#C0C0C0'}
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
          <div className="section-subtitle">Monte Carlo DPV preview</div>
        </div>
        <span className="chip">3D Active</span>
      </div>

      <div className="w-full h-[250px] relative rounded-lg overflow-hidden border border-white/10 bg-black/40">
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 z-10">
            Awaiting collateral assessment...
          </div>
        )}
        <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
          <ambientLight intensity={0.8} />
          {isReady && <RiskPathsGroup paths={paths} />}
          <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 1.5} />
        </Canvas>
      </div>

      <div className="mt-4 flex justify-between text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#ff3333]"></div>
          <span>5th Percentile Risk Paths</span>
        </div>
        <div>
          Paths simulated: {paths.length}
        </div>
      </div>
    </HoloCard>
  );
}
