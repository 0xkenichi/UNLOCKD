import { Canvas } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import HoloCard from '../common/HoloCard.jsx';

export default function ValuationPreview3D({ paths = [] }) {
  return (
    <HoloCard distort={0.4}>
      <h3 className="holo-title holo-glow">Risk Simulation</h3>
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
