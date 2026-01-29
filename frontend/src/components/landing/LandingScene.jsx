import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import ParticleField from '../common/ParticleField.jsx';

export default function LandingScene() {
  return (
    <Canvas>
      <ambientLight intensity={0.6} />
      <pointLight position={[2, 3, 4]} intensity={0.9} />
      <Stars radius={40} depth={20} count={2000} factor={2} fade />
      <ParticleField />
      <mesh>
        <sphereGeometry args={[1.5, 48, 48]} />
        <meshStandardMaterial color="#C0C0C0" emissive="#123056" />
      </mesh>
    </Canvas>
  );
}
