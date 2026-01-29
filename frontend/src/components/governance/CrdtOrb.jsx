import { Canvas } from '@react-three/fiber';
import HoloCard from '../common/HoloCard.jsx';

export default function CrdtOrb() {
  return (
    <HoloCard distort={0.2}>
      <h3 className="holo-title holo-glow">CRDT Orb</h3>
      <div className="muted">
        Stake CRDT to unlock risk committee privileges.
      </div>
      <Canvas className="holo-canvas">
        <ambientLight intensity={0.7} />
        <mesh rotation={[0.2, 0.6, 0]}>
          <sphereGeometry args={[1.1, 48, 48]} />
          <meshStandardMaterial color="#C0C0C0" emissive="#274060" />
        </mesh>
      </Canvas>
      <button className="button">Stake CRDT</button>
    </HoloCard>
  );
}
