import { useRef, Component, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { TextureLoader } from 'three';
import { geoPings, latLngToVector3 } from '../../data/geoPings.js';

const EARTH_TEXTURE =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r150/examples/textures/planets/earth_atmos_2048.jpg';

class SceneErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function PingPoint({ ping }) {
  const [hovered, setHovered] = useState(false);
  const pos = latLngToVector3(ping.lat, ping.lng);
  const label = [ping.city, ping.state, ping.country].filter(Boolean).join(', ');

  return (
    <group position={pos}>
      <mesh
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial
          color={hovered ? '#58a6ff' : '#79c0ff'}
          transparent
          opacity={hovered ? 1 : 0.9}
        />
      </mesh>
      {hovered && (
        <Html
          center
          distanceFactor={8}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono), monospace',
            fontSize: '11px',
            color: '#e6edf3',
            background: 'rgba(10, 14, 20, 0.92)',
            padding: '6px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(88, 166, 255, 0.35)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
          <div style={{ color: '#79c0ff', fontWeight: 700 }}>{ping.count.toLocaleString()} users</div>
        </Html>
      )}
    </group>
  );
}

/**
 * Real Earth globe with user ping dots and labels.
 * Labels + numbers shown on hover.
 */
function EarthSphere() {
  const mesh = useRef();
  const group = useRef();
  const texture = useLoader(TextureLoader, EARTH_TEXTURE);

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = state.clock.elapsedTime * 0.08;
  });

  return (
    <group ref={group} scale={2.2}>
      <mesh ref={mesh}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          map={texture}
          metalness={0.1}
          roughness={0.8}
          emissive="#0a1520"
        />
      </mesh>
      {geoPings.map((ping) => (
        <PingPoint key={`${ping.city}-${ping.country}`} ping={ping} />
      ))}
    </group>
  );
}

function EarthFallback() {
  const mesh = useRef();
  const group = useRef();

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = state.clock.elapsedTime * 0.08;
  });

  return (
    <group ref={group} scale={2.2}>
      <mesh ref={mesh}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial
          color="#1a3a4a"
          metalness={0.15}
          roughness={0.75}
          emissive="#0a1520"
        />
      </mesh>
    </group>
  );
}

export default function LandingScene() {
  return (
    <SceneErrorBoundary
      fallback={
        <Canvas camera={{ position: [0, 0, 4.5], fov: 50 }} gl={{ alpha: true }} style={{ background: 'transparent' }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 2, 5]} intensity={1.2} />
          <EarthFallback />
        </Canvas>
      }
    >
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 50 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 2, 5]} intensity={1.2} />
        <directionalLight position={[-2, -1, 3]} intensity={0.5} />
        <pointLight position={[5, 5, 5]} intensity={0.3} />
        <EarthSphere />
      </Canvas>
    </SceneErrorBoundary>
  );
}
