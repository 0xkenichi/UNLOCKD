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
  const [places, setPlaces] = useState([]);
  const [livePings, setLivePings] = useState([]);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  // Keep a ref to places so the interval can grab random coords without closure-capture issues
  const placesRef = useRef([]);

  // Fetch High-Accuracy Places Data for city labels and action coordinates
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_populated_places_simple.geojson')
      .then(res => res.json())
      .then(data => {
        const placesData = data.features.map(f => ({
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          name: f.properties.name,
          pop: Math.max(f.properties.pop_max, f.properties.pop_min)
        }));
        setPlaces(placesData);
        placesRef.current = placesData;
      })
      .catch(console.error);
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Simulate Live Action Feed 
  useEffect(() => {
    let cancelled = false;

    // Pop a "new user action" at a random real-world coordinate every 1 to 3 seconds
    const loopSimulator = () => {
      if (cancelled) return;

      const arr = placesRef.current;
      if (arr.length > 0) {
        setLivePings(prev => {
          // Grab random real-world location
          const randPlace = arr[Math.floor(Math.random() * arr.length)];
          const newPing = {
            id: Date.now() + Math.random(),
            lat: randPlace.lat,
            lng: randPlace.lng,
            maxR: Math.random() * 4 + 2, // random expanding radius
            propagationSpeed: (Math.random() - 0.5) * 1 + 2,
            repeatPeriod: 1500 + Math.random() * 1000
          };

          // Keep only the last 15 active rings on the globe so it doesn't get utterly cluttered
          let nextState = [...prev, newPing];
          if (nextState.length > 15) nextState.shift();
          return nextState;
        });
      }

      const nextDelay = 800 + Math.random() * 2000; // Next event happens between 0.8s and 2.8s
      setTimeout(loopSimulator, nextDelay);
    };

    // Kick off
    const initialDelay = setTimeout(loopSimulator, 2000);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
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

  // We'll keep arcs empty or derive them from recent active live pings if desired.
  // For the purest "Live Ping" simulator, removing static arcs highlights the real-time rings.
  const arcsData = [];

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
        showAtmosphere={true}
        atmosphereColor="#3b82f6"
        atmosphereAltitude={0.15}

        // ── Perfect Accuracy City Labels ──
        labelsData={places}
        labelLat={d => d.lat}
        labelLng={d => d.lng}
        labelText={d => d.name}
        labelSize={d => Math.max(0.4, Math.sqrt(d.pop) * 2e-4)}
        labelDotRadius={d => Math.max(0.2, Math.sqrt(d.pop) * 1e-4)}
        labelColor={() => 'rgba(255, 255, 255, 0.85)'}
        labelResolution={2}

        // ── LIVE Simulator Action Rings ──
        ringsData={livePings}
        ringColor={() => t => `rgba(59,130,246,${Math.sqrt(1 - t)})`}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"

        // ── Arc lines between top cities ──
        arcsData={arcsData}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={2200}
        arcStroke={0.5}
        arcAltitude={0.15}
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
