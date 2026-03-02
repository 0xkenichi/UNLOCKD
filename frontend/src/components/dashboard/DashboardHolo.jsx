import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text, Sphere } from '@react-three/drei';
import PropTypes from 'prop-types';
import { useMemo, useRef } from 'react';

// Node component for each unlock event
function TimelineNode({ position, title, amount, delay }) {
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + delay) * 0.15;
    }
  });

  return (
    <group position={position} ref={meshRef}>
      <Sphere args={[0.3, 32, 32]}>
        <meshStandardMaterial color="#C0C0C0" emissive="#001F3F" emissiveIntensity={0.5} />
      </Sphere>
      <Text position={[0, 0.6, 0]} fontSize={0.2} color="#ffffff" anchorX="center" anchorY="bottom">
        {title}
      </Text>
      <Text position={[0, -0.6, 0]} fontSize={0.15} color="#A0A0A0" anchorX="center" anchorY="top">
        {amount}
      </Text>
    </group>
  );
}

TimelineNode.propTypes = {
  position: PropTypes.array.isRequired,
  title: PropTypes.string.isRequired,
  amount: PropTypes.string.isRequired,
  delay: PropTypes.number.isRequired
};

export default function DashboardHolo({ positions = [] }) {
  // Generate curve points for the main timeline spine
  const curvePoints = useMemo(() => {
    const points = [];
    for (let i = -5; i <= 5; i += 0.5) {
      points.push([i, Math.sin(i) * 0.2, 0]);
    }
    return points;
  }, []);

  return (
    <div className="w-full h-[400px] bg-black/20 rounded-xl overflow-hidden relative border border-white/10 shadow-[0_0_30px_rgba(0,31,63,0.5)]">
      <div className="absolute top-4 left-6 z-10 pointer-events-none">
        <h2 className="text-xl font-bold text-white holo-glow mb-1">Your 3D Timeline</h2>
        <p className="text-sm text-gray-400">Interactive overview of your unlocking liquidity layers.</p>
      </div>
      <Canvas camera={{ position: [0, 2, 8], fov: 40 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#C0C0C0" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#001F3F" />

        {/* The Timeline Spine */}
        <Line points={curvePoints} color="#C0C0C0" lineWidth={3} dashed dashScale={5} />

        {/* Dynamic Nodes for each user position */}
        {positions.map((pos, i) => (
          <TimelineNode
            key={i}
            position={[i * 2.5 - 3.5, Math.sin(i * 2.5 - 3.5) * 0.2, 0]}
            title={pos.title || `Unlock ${i + 1}`}
            amount={pos.amount || '0 USDC'}
            delay={i * 0.5}
          />
        ))}

        {/* Empty state nodes if no positions exist */}
        {positions.length === 0 && (
          <>
            <TimelineNode position={[-2.5, Math.sin(-2.5) * 0.2, 0]} title="Example Unlock" amount="$5,000" delay={0} />
            <TimelineNode position={[0, Math.sin(0) * 0.2, 0]} title="Future Liquidity" amount="Locked" delay={0.5} />
            <TimelineNode position={[2.5, Math.sin(2.5) * 0.2, 0]} title="Final Vest" amount="Q3 2026" delay={1.0} />
          </>
        )}

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
}

DashboardHolo.propTypes = {
  positions: PropTypes.array
};
