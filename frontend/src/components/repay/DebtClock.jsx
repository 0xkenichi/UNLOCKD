import { Canvas } from '@react-three/fiber';
import HoloCard from '../common/HoloCard.jsx';

export default function DebtClock() {
  return (
    <HoloCard distort={0.3}>
      <h3 className="holo-title holo-glow">Debt Clock</h3>
      <div className="muted">
        Accrued interest ticks until settlement. Repay to stop the clock.
      </div>
      <Canvas className="holo-canvas">
        <ambientLight intensity={0.7} />
        <mesh rotation={[0.2, 0, 0]}>
          <torusGeometry args={[1.1, 0.25, 32, 64]} />
          <meshStandardMaterial color="#C0C0C0" emissive="#1f3b5a" />
        </mesh>
      </Canvas>
      <button className="button">Repay Partial</button>
    </HoloCard>
  );
}
