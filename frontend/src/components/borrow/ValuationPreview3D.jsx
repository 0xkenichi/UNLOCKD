import { Canvas } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import HoloCard from '../common/HoloCard.jsx';

export default function ValuationPreview3D({ paths = [] }) {
  return (
    <HoloCard distort={0.4}>
      <div className="section-head">
        <div>
          <h3 className="section-title">Risk Simulation</h3>
          <div className="section-subtitle">Monte Carlo preview</div>
        </div>
        <span className="chip">3D</span>
      </div>
      <div className="progress-meta">
        <span>Paths</span>
        <span>{paths.length}</span>
      </div>
      <Canvas className="holo-canvas">
        <ambientLight intensity={0.6} />
        {paths.map((path, index) => (
          <Line
            key={index}
            points={path}
            color={index < 10 ? '#B00020' : '#C0C0C0'}
            lineWidth={1}
          />
        ))}
      </Canvas>
    </HoloCard>
  );
}
