import { Canvas } from '@react-three/fiber';
import HoloCard from '../common/HoloCard.jsx';

export default function CrdtOrb() {
  const handleStake = () => {
    const target = document.getElementById('governance-feed');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <HoloCard distort={0.2}>
      <div className="section-head">
        <div>
          <h3 className="section-title">CRDT Orb</h3>
          <div className="section-subtitle">
            Stake CRDT to unlock committee privileges.
          </div>
        </div>
        <span className="chip">Stake</span>
      </div>
      <Canvas className="holo-canvas">
        <ambientLight intensity={0.7} />
        <mesh rotation={[0.2, 0.6, 0]}>
          <sphereGeometry args={[1.1, 48, 48]} />
          <meshStandardMaterial color="#C0C0C0" emissive="#274060" />
        </mesh>
      </Canvas>
      <button className="button" type="button" onClick={handleStake}>
        Stake CRDT
      </button>
    </HoloCard>
  );
}
