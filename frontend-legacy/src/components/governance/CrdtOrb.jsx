// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, OrbitControls, Float } from '@react-three/drei';
import { useRef, useState } from 'react';
import HoloCard from '../common/HoloCard.jsx';

function AnimatedOrb({ hovered }) {
  const orbRef = useRef();

  useFrame((state) => {
    if (orbRef.current) {
      orbRef.current.rotation.x = state.clock.elapsedTime * 0.2;
      orbRef.current.rotation.y = state.clock.elapsedTime * 0.3;

      // Pulse scale
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.05 + (hovered ? 0.2 : 0);
      orbRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <mesh ref={orbRef}>
        <sphereGeometry args={[1.2, 64, 64]} />
        <MeshDistortMaterial
          color="#c4a26c"
          emissive={hovered ? "#4a3a1f" : "#2e2414"}
          emissiveIntensity={hovered ? 0.8 : 0.5}
          distort={hovered ? 0.4 : 0.2}
          speed={hovered ? 4 : 2}
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>
    </Float>
  );
}

export default function CrdtOrb() {
  const [hovered, setHovered] = useState(false);

  const handleOpenFeed = () => {
    const target = document.getElementById('governance-feed');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <HoloCard distort={0.2} className="relative z-10 transition-transform duration-300">
      <div className="section-head mb-4 relative z-20">
        <div>
          <h3 className="section-title holo-glow">CRDT Identity Orb</h3>
          <div className="section-subtitle">
            Governance preview. On-chain voting is not active yet.
          </div>
        </div>
        <span className="chip">ZK Power</span>
      </div>

      <div
        className="relative w-full" style={{ height: 300, cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleOpenFeed}
      >
        <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1.5} color="#f2ecdf" />
          <AnimatedOrb hovered={hovered} />
          <OrbitControls enableZoom={false} enablePan={false} />
        </Canvas>
      </div>

      <div className="muted" style={{ marginTop: 8, textAlign: 'center', fontSize: 13 }}>
        Click the orb to participate in governance
      </div>
    </HoloCard>
  );
}
