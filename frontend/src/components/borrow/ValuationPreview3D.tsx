'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import { useRef } from 'react';
import HoloCard from '@/components/ui/HoloCard';
import * as THREE from 'three';

interface RiskPathsGroupProps {
  paths: number[][][];
}

function RiskPathsGroup({ paths }: RiskPathsGroupProps) {
  const groupRef = useRef<THREE.Group>(null);

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
          // @ts-ignore
          points={path.map(p => [p[0] * 4, p[1] * 2, (index - paths.length / 2) * 0.1])}
          color={index < 5 ? '#ff3333' : '#C0C0C0'}
          lineWidth={1.5}
          opacity={index < 5 ? 1 : 0.3}
          transparent
        />
      ))}
    </group>
  );
}

interface ValuationPreview3DProps {
  paths?: number[][][];
}

export default function ValuationPreview3D({ paths = [] }: ValuationPreview3DProps) {
  const isReady = paths && paths.length > 0;

  return (
    <HoloCard distort={0.4}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Risk Simulation</h3>
          <div className="text-sm text-gray-400">Monte Carlo DPV preview</div>
        </div>
        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
          3D Active
        </span>
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
