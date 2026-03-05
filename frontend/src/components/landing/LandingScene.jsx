// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useRef, Component, useEffect, useState, useMemo } from 'react';
import Globe from 'react-globe.gl';
import { feature } from 'topojson-client';

// ─── Chain registry — each chain has a color and real-world DeFi city biases ─
const CHAINS = [
  { id: 'eth', label: 'Ethereum', color: '#627eea', ring: t => `rgba(98,126,234,${Math.sqrt(1 - t) * 0.9})`, bias: ['New York', 'London', 'Zürich', 'Frankfurt', 'Tokyo'] },
  { id: 'base', label: 'Base', color: '#0052ff', ring: t => `rgba(0,82,255,${Math.sqrt(1 - t) * 0.9})`, bias: ['San Francisco', 'Los Angeles', 'Seattle', 'Austin', 'Boston'] },
  { id: 'arbitrum', label: 'Arbitrum', color: '#28a0f0', ring: t => `rgba(40,160,240,${Math.sqrt(1 - t) * 0.9})`, bias: ['New York', 'Chicago', 'Miami', 'Singapore', 'Seoul'] },
  { id: 'solana', label: 'Solana', color: '#9945ff', ring: t => `rgba(153,69,255,${Math.sqrt(1 - t) * 0.9})`, bias: ['San Francisco', 'Miami', 'New York', 'Lisbon', 'Dubai'] },
  { id: 'sui', label: 'Sui', color: '#4da2ff', ring: t => `rgba(77,162,255,${Math.sqrt(1 - t) * 0.9})`, bias: ['Singapore', 'Hong Kong', 'Tokyo', 'Seoul', 'Sydney'] },
  { id: 'avax', label: 'Avalanche', color: '#e84142', ring: t => `rgba(232,65,66,${Math.sqrt(1 - t) * 0.9})`, bias: ['New York', 'Toronto', 'São Paulo', 'Melbourne', 'Johannesburg'] },
];

// ─── Error Boundary ───────────────────────────────────────────────────────────
class SceneErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function getTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme || 'dark';
}

// ─── Chain Explorer Overlay ───────────────────────────────────────────────────
function ChainExplorerOverlay({ activeChains, onToggle, mode, onModeToggle }) {
  const isLight = getTheme() === 'light';
  const bg = isLight ? 'rgba(240,244,251,0.92)' : 'rgba(8,12,22,0.88)';
  const border = isLight ? 'rgba(59,102,196,0.2)' : 'rgba(88,166,255,0.15)';
  const text = isLight ? '#0a0f1e' : '#e2e8f0';

  return (
    <div style={{
      position: 'absolute', bottom: 24, right: 24, zIndex: 20,
      background: bg, border: `1px solid ${border}`,
      borderRadius: 16, padding: '14px 16px',
      backdropFilter: 'blur(16px)',
      fontFamily: "'Space Grotesk', sans-serif",
      display: 'flex', flexDirection: 'column', gap: 10,
      minWidth: 180,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: mode === 'chain' ? '#60a5fa' : '#64748b' }}>
          {mode === 'live' ? '⚡ Live Feed' : '🌐 Chain Explorer'}
        </span>
        <button onClick={onModeToggle} style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: mode === 'chain' ? 'rgba(59,130,246,0.2)' : 'rgba(100,116,139,0.15)',
          border: `1px solid ${mode === 'chain' ? 'rgba(59,130,246,0.4)' : 'rgba(100,116,139,0.3)'}`,
          borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: text,
        }}>Switch</button>
      </div>

      {mode === 'chain' && (
        <>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Show chains:</div>
          {CHAINS.map(chain => (
            <button
              key={chain.id}
              onClick={() => onToggle(chain.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                borderRadius: 8, border: `1px solid ${activeChains.has(chain.id) ? chain.color + '60' : border}`,
                background: activeChains.has(chain.id) ? chain.color + '18' : 'transparent',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: chain.color,
                boxShadow: activeChains.has(chain.id) ? `0 0 8px ${chain.color}` : 'none',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: activeChains.has(chain.id) ? text : '#64748b' }}>
                {chain.label}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Main Globe ───────────────────────────────────────────────────────────────
function EarthGlobe() {
  const globeEl = useRef();
  const [hexData, setHexData] = useState([]);
  const [livePings, setLivePings] = useState([]);
  const [theme, setTheme] = useState(getTheme);
  const [mode, setMode] = useState('live'); // 'live' | 'chain'
  const [activeChains, setActiveChains] = useState(new Set(CHAINS.map(c => c.id)));
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  const placesRef = useRef([]);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch('https://unpkg.com/world-atlas@2/land-110m.json')
      .then(res => res.json())
      .then(data => setHexData(feature(data, data.objects.land).features))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_populated_places_simple.geojson')
      .then(res => res.json())
      .then(data => {
        placesRef.current = data.features.map(f => ({
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          name: f.properties.name,
        }));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Live action simulator
  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      const arr = placesRef.current;
      if (arr.length > 0) {
        setLivePings(prev => {
          const p = arr[Math.floor(Math.random() * arr.length)];
          const ping = { id: Date.now() + Math.random(), lat: p.lat, lng: p.lng, maxR: Math.random() * 3 + 1.5, propagationSpeed: Math.random() * 1.5 + 1.5, repeatPeriod: 1200 + Math.random() * 800, chain: null };
          const next = [...prev, ping];
          return next.length > 20 ? next.slice(-20) : next;
        });
      }
      setTimeout(loop, 600 + Math.random() * 1800);
    };
    const t = setTimeout(loop, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mode]);

  // Chain explorer simulator — bias active chains toward their cities
  const chainPings = useMemo(() => {
    if (mode !== 'chain') return [];
    const places = placesRef.current;
    if (!places.length) return [];

    const pings = [];
    CHAINS.forEach(chain => {
      if (!activeChains.has(chain.id)) return;
      // seed 25–40 pings spread around the globe with chain city bias
      const count = 25 + Math.floor(Math.random() * 15);
      for (let i = 0; i < count; i++) {
        // 60% chance: pick near one of chain's biased cities, 40%: random global
        let place;
        if (Math.random() < 0.6 && chain.bias.length) {
          const cityName = chain.bias[Math.floor(Math.random() * chain.bias.length)];
          const match = places.find(p => p.name === cityName) || places[Math.floor(Math.random() * places.length)];
          // Slightly spread around the city
          place = { lat: match.lat + (Math.random() - 0.5) * 12, lng: match.lng + (Math.random() - 0.5) * 18 };
        } else {
          place = places[Math.floor(Math.random() * places.length)];
        }
        pings.push({
          id: `${chain.id}-${i}`,
          lat: place.lat,
          lng: place.lng,
          maxR: 2.5 + Math.random() * 2,
          propagationSpeed: 1.5 + Math.random(),
          repeatPeriod: 1500 + Math.random() * 1500,
          chainColor: chain.color,
          chainRing: chain.ring,
        });
      }
    });
    return pings;
  }, [mode, activeChains, placesRef.current.length > 0]); // eslint-disable-line

  useEffect(() => {
    const g = globeEl.current;
    if (!g) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.enableRotate = true;
    controls.zoomSpeed = 0.8;
    controls.minDistance = 100;
    controls.maxDistance = 700;
    g.pointOfView({ altitude: 1.8 }, 0);
  }, []);

  const isLight = theme === 'light';
  const activePings = mode === 'live' ? livePings : chainPings;

  const hexColor = isLight ? () => 'rgba(10, 40, 130, 0.3)' : () => 'rgba(88, 166, 255, 0.4)';
  const atmColor = isLight ? '#1d48b0' : '#3b82f6';
  const defaultRingColor = isLight
    ? () => t => `rgba(14, 50, 160, ${Math.sqrt(1 - t)})`
    : () => t => `rgba(59, 130, 246, ${Math.sqrt(1 - t)})`;

  const ringColorFn = mode === 'chain'
    ? d => (d.chainRing ? d.chainRing : t => `rgba(59,130,246,${Math.sqrt(1 - t)})`)
    : defaultRingColor;

  const toggleChain = id => setActiveChains(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleMode = () => setMode(m => m === 'live' ? 'chain' : 'live');

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, overflow: 'hidden' }}>
      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundColor={isLight ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0)'}
        showAtmosphere={true}
        atmosphereColor={atmColor}
        atmosphereAltitude={0.18}
        hexPolygonsData={hexData}
        hexPolygonResolution={3}
        hexPolygonMargin={0.3}
        hexPolygonColor={hexColor}
        hexPolygonAltitude={0.001}
        hexPolygonsTransitionDuration={0}
        ringsData={activePings}
        ringColor={ringColorFn}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
      />

      {/* Chain Explorer control panel */}
      <ChainExplorerOverlay
        activeChains={activeChains}
        onToggle={toggleChain}
        mode={mode}
        onModeToggle={toggleMode}
      />
    </div>
  );
}

export default function LandingScene() {
  return (
    <SceneErrorBoundary
      fallback={
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: '#8b949e', fontFamily: 'monospace', fontSize: '14px',
        }}>
          Initializing 3D Environment…
        </div>
      }
    >
      <EarthGlobe />
    </SceneErrorBoundary>
  );
}
