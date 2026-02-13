import { useRef, Component, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { TextureLoader } from 'three';
import { latLngToVector3 } from '../../data/geoPings.js';
import { apiGet, fetchActivity } from '../../utils/api.js';

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

function normalizePings(items = []) {
  return items
    .filter((item) =>
      typeof item?.lat === 'number' &&
      typeof item?.lng === 'number' &&
      typeof item?.city === 'string' &&
      typeof item?.country === 'string'
    )
    .map((item) => ({
      lat: item.lat,
      lng: item.lng,
      city: item.city,
      state: item.state || null,
      country: item.country,
      count: Number.isFinite(Number(item.count)) ? Math.max(0, Number(item.count)) : 0
    }));
}

/**
 * Real Earth globe with user ping dots and labels.
 * Labels + numbers shown on hover.
 */
function EarthSphere() {
  const mesh = useRef();
  const group = useRef();
  const texture = useLoader(TextureLoader, EARTH_TEXTURE);
  const [livePings, setLivePings] = useState([]);
  const rotation = useRef({ x: 0.15, y: 0 });

  useEffect(() => {
    let cancelled = false;

    async function hydratePingData() {
      let pingsFromApi = null;
      let liveUserCount = null;

      try {
        const geo = await apiGet('/api/geo-pings');
        const normalized = normalizePings(geo?.items || []);
        if (normalized.length > 0) {
          pingsFromApi = normalized;
        }
      } catch (_error) {
        // Optional endpoint: if unavailable we gracefully fall back.
      }

      try {
        const activity = await fetchActivity();
        const borrowers = new Set(
          (activity?.items || []).map((item) => item?.borrower).filter(Boolean)
        );
        liveUserCount = borrowers.size;
      } catch (_error) {
        liveUserCount = null;
      }

      if (cancelled) return;

      if (pingsFromApi) {
        setLivePings(pingsFromApi);
        return;
      }

      if (typeof liveUserCount === 'number' && liveUserCount >= 0) {
        // No synthetic geo fallback: render empty globe until real pings exist.
        setLivePings([]);
      }
    }

    hydratePingData();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalUsers = useMemo(
    () => livePings.reduce((sum, ping) => sum + (ping.count || 0), 0),
    [livePings]
  );

  useFrame((_state, delta) => {
    if (!group.current) return;
    rotation.current.y += delta * 0.2;
    group.current.rotation.x = rotation.current.x;
    group.current.rotation.y = rotation.current.y;
  });

  return (
    <group ref={group} scale={1.95}>
      <mesh ref={mesh}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          map={texture}
          metalness={0.1}
          roughness={0.8}
          emissive="#0a1520"
        />
      </mesh>
      {livePings.map((ping) => (
        <PingPoint key={`${ping.city}-${ping.country}-${ping.lat}-${ping.lng}`} ping={ping} />
      ))}
      <Html position={[0, -1.38, 0]} center distanceFactor={8}>
        <div
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            fontFamily: 'var(--font-mono), monospace',
            fontSize: '11px',
            color: '#a5d6ff',
            background: 'rgba(10, 14, 20, 0.82)',
            border: '1px solid rgba(88, 166, 255, 0.28)',
            borderRadius: '8px',
            padding: '5px 9px'
          }}
        >
          Live users: {totalUsers > 0 ? totalUsers.toLocaleString() : '—'}
        </div>
      </Html>
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
    <group ref={group} scale={1.95}>
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
        <Canvas camera={{ position: [0, 0, 5.4], fov: 50 }} gl={{ alpha: true }} style={{ background: 'transparent' }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 2, 5]} intensity={1.2} />
          <EarthFallback />
        </Canvas>
      }
    >
      <Canvas
        camera={{ position: [0, 0, 5.4], fov: 50 }}
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
