import { Canvas } from '@react-three/fiber';
import { MeshDistortMaterial, OrbitControls } from '@react-three/drei';

export default function HoloCard({ children, distort = 0.25 }) {
  return (
    <div className="holo-card">
      <Canvas className="holo-canvas">
        <ambientLight intensity={0.5} />
        <mesh>
          <planeGeometry args={[5, 3]} />
          <MeshDistortMaterial distort={distort} speed={2} color="#C0C0C0" />
        </mesh>
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
      <div className="holo-card-content">{children}</div>
    </div>
  );
}
