// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Canvas } from '@react-three/fiber';
import { MeshDistortMaterial, OrbitControls, Environment } from '@react-three/drei';
import PropTypes from 'prop-types';

export default function HoloCard({ children, distort = 0.3, className = '' }) {
  return (
    <div className={`holo-card relative overflow-hidden bg-graphite rounded-xl border border-white/5 ${className}`}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.4, pointerEvents: 'none' }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} color="#e6dece" />
          <mesh visible userData={{ hello: 'world' }}>
            <planeGeometry args={[10, 6, 32, 32]} />
            <MeshDistortMaterial
              color="#2e2414"
              emissive="#11100d"
              distort={distort}
              speed={2}
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
          <Environment preset="city" />
        </Canvas>
      </div>
      <div style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

HoloCard.propTypes = {
  children: PropTypes.node.isRequired,
  distort: PropTypes.number,
  className: PropTypes.string
};
