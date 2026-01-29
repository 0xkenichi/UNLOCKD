import { Canvas } from '@react-three/fiber';
import { Line } from '@react-three/drei';

export default function DashboardHolo({ positions = [] }) {
  return (
    <div>
      <h3 className="holo-title holo-glow">Your Timeline</h3>
      <Canvas className="holo-canvas">
        <ambientLight intensity={0.6} />
        <Line
          points={[
            [-4, 0, 0],
            [4, 0, 0]
          ]}
          color="#C0C0C0"
          lineWidth={2}
        />
        {positions.map((position, index) => (
          <mesh key={position.id} position={[-3 + index * 2, 0.8, 0]}>
            <sphereGeometry args={[0.35, 24, 24]} />
            <meshStandardMaterial color="#001F3F" emissive="#C0C0C0" />
          </mesh>
        ))}
      </Canvas>
    </div>
  );
}
