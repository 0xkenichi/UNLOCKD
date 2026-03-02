import { useRef, Component, useEffect, useMemo, useState, useCallback } from 'react';
import Globe from 'react-globe.gl';
import { apiGet, fetchActivity } from '../../utils/api.js';

// ─── Textures ────────────────────────────────────────────────────────────────
const EARTH_TEXTURE =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r150/examples/textures/planets/earth_atmos_2048.jpg';
const EARTH_BUMP =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r150/examples/textures/planets/earth_normal_2048.jpg';

// ─── Fallback demo pings (shown when API has no data yet) ────────────────────
const DEMO_PINGS = [
  { lat: 40.7128, lng: -74.006, city: 'New York', state: 'NY', country: 'US', count: 42 },
  { lat: 51.5074, lng: -0.1278, city: 'London', state: null, country: 'UK', count: 31 },
  { lat: 35.6762, lng: 139.6503, city: 'Tokyo', state: null, country: 'JP', count: 28 },
  { lat: 37.7749, lng: -122.4194, city: 'San Francisco', state: 'CA', country: 'US', count: 24 },
  { lat: 1.3521, lng: 103.8198, city: 'Singapore', state: null, country: 'SG', count: 19 },
  { lat: 52.52, lng: 13.405, city: 'Berlin', state: null, country: 'DE', count: 15 },
  { lat: -33.8688, lng: 151.2093, city: 'Sydney', state: 'NSW', country: 'AU', count: 12 },
  { lat: 48.8566, lng: 2.3522, city: 'Paris', state: null, country: 'FR', count: 11 },
  { lat: 25.2048, lng: 55.2708, city: 'Dubai', state: null, country: 'AE', count: 9 },
  { lat: 19.076, lng: 72.8777, city: 'Mumbai', state: null, country: 'IN', count: 8 },
  { lat: 43.6532, lng: -79.3832, city: 'Toronto', state: 'ON', country: 'CA', count: 7 },
  { lat: -23.5505, lng: -46.6333, city: 'São Paulo', state: null, country: 'BR', count: 6 },
];

// ─── Error boundary ───────────────────────────────────────────────────────────
class SceneErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
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

// ─── Main Globe ────────────────────────────────────────────────────────────────
function EarthGlobe() {
  const globeEl = useRef();
  const [livePings, setLivePings] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  const [selectedPing, setSelectedPing] = useState(null);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Simulate live geo pings
  useEffect(() => {
    let cancelled = false;

    // Initial load
    setLivePings(DEMO_PINGS);
    setIsDemo(true);

    // Fluctuate counts to make it feel "live"
    const interval = setInterval(() => {
      if (cancelled) return;
      setLivePings(prev => prev.map(ping => {
        // Randomly adjust count slightly up or down, bounded between 5 and 100
        const change = Math.floor(Math.random() * 5) - 2;
        const newCount = Math.max(5, Math.min(100, ping.count + change));
        return { ...ping, count: newCount };
      }));
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Globe setup — FULL interactivity
  useEffect(() => {
    const g = globeEl.current;
    if (!g) return;

    const controls = g.controls();

    // ✅ Enable everything
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = true;          // scroll to zoom
    controls.enablePan = false;          // no panning — only rotation
    controls.enableRotate = true;        // click-drag to spin
    controls.zoomSpeed = 0.8;
    controls.rotateSpeed = 0.6;
    controls.minDistance = 120;          // max zoom in
    controls.maxDistance = 800;          // max zoom out

    // Start slightly zoomed out for cinematic feel
    g.pointOfView({ altitude: 2.0 }, 0);
  }, []);

  const totalUsers = useMemo(
    () => livePings.reduce((sum, p) => sum + (p.count || 0), 0),
    [livePings]
  );

  const maxCount = useMemo(
    () => Math.max(...livePings.map(p => p.count), 1),
    [livePings]
  );

  // Build ring arcs between top cities for visual flair
  const arcsData = useMemo(() => {
    if (livePings.length < 2) return [];
    const top = [...livePings].sort((a, b) => b.count - a.count).slice(0, 6);
    const arcs = [];
    for (let i = 0; i < top.length - 1; i++) {
      arcs.push({
        startLat: top[i].lat, startLng: top[i].lng,
        endLat: top[i + 1].lat, endLng: top[i + 1].lng,
        color: ['rgba(88,166,255,0.6)', 'rgba(88,166,255,0)'],
      });
    }
    return arcs;
  }, [livePings]);

  return (
    <div
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, overflow: 'hidden' }}
    >
      {/* Inline keyframe styles */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #34d399; }
          50% { opacity: 0.5; box-shadow: 0 0 14px #34d399; }
        }
        @keyframes ping-pulse {
          0% { transform: scale(1); opacity: 0.9; }
          70% { transform: scale(2.8); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; pointer-events: none; }
        }
      `}</style>

      <Globe
        ref={globeEl}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl={EARTH_TEXTURE}
        bumpImageUrl={EARTH_BUMP}
        backgroundColor="rgba(0,0,0,0)"

        // ── Arc lines between top cities ──
        arcsData={arcsData}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={2200}
        arcStroke={0.5}
        arcAltitude={0.15}

        // ── HTML pin markers (city dots) ──
        htmlElementsData={livePings}
        htmlElement={(d) => {
          const wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          wrapper.style.cursor = 'pointer';

          const size = Math.max(10, Math.min(28, 10 + (d.count / maxCount) * 18));

          // main dot
          const dot = document.createElement('div');
          dot.style.cssText = `
            width: ${size}px; height: ${size}px;
            background: radial-gradient(circle at 35% 35%, #7ec8ff, #3b82f6 60%, #1d4ed8);
            border-radius: 50%;
            border: 1.5px solid rgba(147,197,253,0.9);
            box-shadow: 0 0 ${Math.round(size * 0.8)}px rgba(88,166,255,0.85),
                        0 0 ${Math.round(size * 1.4)}px rgba(59,130,246,0.4);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            position: relative; z-index: 2;
          `;

          // pulse ring
          const pulse = document.createElement('div');
          pulse.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            width: ${size}px; height: ${size}px;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            border: 2px solid rgba(88,166,255,0.6);
            animation: ping-pulse ${1.8 + Math.random() * 1.2}s ease-out infinite;
            pointer-events: none;
          `;

          // tooltip
          const tooltip = document.createElement('div');
          const location = [d.city, d.state, d.country].filter(Boolean).join(', ');
          tooltip.innerHTML = `
            <div style="font-weight:700; color:#e6edf3; font-size:12px; margin-bottom:3px;">${location}</div>
            <div style="display:flex; align-items:center; gap:5px;">
              <div style="width:6px;height:6px;border-radius:50%;background:#58a6ff;box-shadow:0 0 5px #58a6ff;flex-shrink:0;"></div>
              <span style="color:#79c0ff; font-weight:700; font-size:13px;">${d.count.toLocaleString()} users</span>
            </div>
          `;
          tooltip.style.cssText = `
            position:absolute; bottom:calc(100% + 10px); left:50%;
            transform:translateX(-50%);
            background:rgba(6,9,18,0.95);
            border:1px solid rgba(88,166,255,0.4);
            padding:8px 12px; border-radius:10px;
            font-family:var(--font-mono,monospace);
            white-space:nowrap; pointer-events:none;
            opacity:0; transition:opacity 0.2s;
            box-shadow:0 6px 24px rgba(0,0,0,0.6);
            z-index:30;
          `;
          // small arrow
          const arrow = document.createElement('div');
          arrow.style.cssText = `
            position:absolute; top:100%; left:50%; transform:translateX(-50%);
            border:5px solid transparent;
            border-top-color:rgba(88,166,255,0.4);
            pointer-events:none;
          `;
          tooltip.appendChild(arrow);

          wrapper.appendChild(pulse);
          wrapper.appendChild(dot);
          wrapper.appendChild(tooltip);

          // Hover interactions
          wrapper.addEventListener('mouseenter', () => {
            dot.style.transform = 'scale(1.6)';
            dot.style.boxShadow = `0 0 24px rgba(88,166,255,1), 0 0 48px rgba(59,130,246,0.6)`;
            tooltip.style.transition = 'opacity 0.05s'; // Instant show
            tooltip.style.opacity = '1';
            const g = globeEl.current;
            if (g) g.controls().autoRotate = false;
          });
          wrapper.addEventListener('mouseleave', () => {
            dot.style.transform = 'scale(1)';
            dot.style.boxShadow = `0 0 ${Math.round(size * 0.8)}px rgba(88,166,255,0.85), 0 0 ${Math.round(size * 1.4)}px rgba(59,130,246,0.4)`;
            tooltip.style.transition = 'opacity 0.15s';
            tooltip.style.opacity = '0';
            const g = globeEl.current;
            if (g) g.controls().autoRotate = true; // Instant resume
          });

          return wrapper;
        }}
      />

    </div>
  );
}

// ─── Export ────────────────────────────────────────────────────────────────────
export default function LandingScene() {
  return (
    <SceneErrorBoundary
      fallback={
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: '#8b949e', fontFamily: 'monospace', fontSize: '14px'
        }}>
          Initializing 3D Environment...
        </div>
      }
    >
      <EarthGlobe />
    </SceneErrorBoundary>
  );
}
