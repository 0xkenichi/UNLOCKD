import { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import ParticleField from '../common/ParticleField.jsx';

function ParallaxGroup() {
  const group = useRef();
  const { size, viewport } = useThree();

  useFrame(({ mouse }) => {
    if (!group.current) return;
    const damp = 0.08;
    const x = (mouse.x * viewport.width) / 16;
    const y = (mouse.y * viewport.height) / 16;
    group.current.rotation.y += (x - group.current.rotation.y) * damp;
    group.current.rotation.x += (-y - group.current.rotation.x) * damp;
    group.current.position.z += (0.1 - group.current.position.z) * damp;
  });

  return (
    <group ref={group}>
      <Stars radius={40} depth={20} count={2000} factor={2} fade speed={0.4} />
      <ParticleField />
      <mesh>
        <sphereGeometry args={[1.5, 48, 48]} />
        <meshStandardMaterial color="#C0C0C0" emissive="#123056" />
      </mesh>
    </group>
  );
}

export default function LandingScene() {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 55 }}>
      <ambientLight intensity={0.6} />
      <pointLight position={[2, 3, 4]} intensity={0.9} />
      <ParallaxGroup />
    </Canvas>
  );
}
