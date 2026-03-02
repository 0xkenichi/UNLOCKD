import { Canvas } from '@react-three/fiber';
import { MeshDistortMaterial, OrbitControls, Environment } from '@react-three/drei';
import PropTypes from 'prop-types';

export default function HoloCard({ children, distort = 0.3, className = '' }) {
  return (
    <div className={`holo-card relative overflow-hidden bg-graphite rounded-xl border border-white/5 ${className}`}>
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} color="#C0C0C0" />
          <mesh visible userData={{ hello: 'world' }}>
            <planeGeometry args={[10, 6, 32, 32]} />
            <MeshDistortMaterial
              color="#001F3F"
              emissive="#001020"
              distort={distort}
              speed={2}
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
          <Environment preset="city" />
        </Canvas>
      </div>
      <div className="relative z-10 p-5 h-full w-full">
        {children}
      </div>
    </div>
  );
}

HoloCard.propTypes = {
  children: PropTypes.node.isRequired,
  distort: PropTypes.number,
  className: PropTypes.string
};
