"use client";

import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text, Sphere } from '@react-three/drei';
import * as THREE from 'three';

interface PositionData {
  title?: string;
  amount?: string;
}

interface TimelineNodeProps {
  position: [number, number, number];
  title: string;
  amount: string;
  delay: number;
}

function TimelineNode({ position, title, amount, delay }: TimelineNodeProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + delay) * 0.15;
    }
  });

  return (
    <group position={position} ref={groupRef}>
      <Sphere args={[0.25, 32, 32]}>
        <meshStandardMaterial color="#2EBEB5" emissive="#001F3F" emissiveIntensity={0.8} />
      </Sphere>
      <Text position={[0, 0.6, 0]} fontSize={0.2} color="#ffffff" anchorX="center" anchorY="bottom" font="/fonts/Inter-Bold.woff">
        {title}
      </Text>
      <Text position={[0, -0.6, 0]} fontSize={0.15} color="#A0A0A0" anchorX="center" anchorY="top" font="/fonts/Inter-Regular.woff">
        {amount}
      </Text>
    </group>
  );
}

export function DashboardHolo({ positions = [] }: { positions?: PositionData[] }) {
  const curvePoints = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = -5; i <= 5; i += 0.5) {
      points.push([i, Math.sin(i) * 0.2, 0]);
    }
    return points;
  }, []);

  return (
    <div className="w-full h-[400px] bg-black/20 rounded-3xl overflow-hidden relative border border-white/5 shadow-[0_0_50px_rgba(46,190,181,0.05)]">
      <div className="absolute top-6 left-8 z-10 pointer-events-none">
        <h2 className="text-xl font-black uppercase tracking-tighter text-glow-teal italic">3D Liquidity Timeline</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary opacity-60">Real-time projection of unlocking layers.</p>
      </div>
      
      <Canvas camera={{ position: [0, 2, 8], fov: 40 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#2EBEB5" />
        <pointLight position={[-10, -10, -10]} intensity={1} color="#40E0FF" />

        {/* The Timeline Spine */}
        <Line 
          points={curvePoints} 
          color="#2EBEB5" 
          lineWidth={1.5} 
          dashed={false}
        />

        {/* Dynamic Nodes */}
        {positions.map((pos, i) => (
          <TimelineNode
            key={i}
            position={[i * 2.5 - 3.5, Math.sin(i * 2.5 - 3.5) * 0.2, 0]}
            title={pos.title || `Unlock ${i + 1}`}
            amount={pos.amount || '0 USDC'}
            delay={i * 0.5}
          />
        ))}

        {/* Empty state nodes */}
        {positions.length === 0 && (
          <>
            <TimelineNode position={[-3, Math.sin(-3) * 0.2, 0]} title="Example Unlock" amount="$5,000" delay={0} />
            <TimelineNode position={[0, Math.sin(0) * 0.2, 0]} title="Future Liquidity" amount="Locked" delay={0.5} />
            <TimelineNode position={[3, Math.sin(3) * 0.2, 0]} title="Final Vest" amount="Q3 2026" delay={1.0} />
          </>
        )}

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>
    </div>
  );
}
