// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Canvas } from '@react-three/fiber';

export default function MaskHolo() {
  return (
    <Canvas className="holo-canvas">
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 2, 3]} intensity={0.6} />
      <mesh rotation={[0.2, 0.6, 0]}>
        <torusKnotGeometry args={[0.8, 0.25, 120, 16]} />
        <meshStandardMaterial color="#C0C0C0" emissive="#1f3b5a" />
      </mesh>
    </Canvas>
  );
}
