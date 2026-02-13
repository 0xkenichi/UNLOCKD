// No static fallback data. Globe points are sourced from backend /api/geo-pings only.
export const geoPings = [];

/**
 * Convert lat/lng to 3D position on unit sphere (Three.js Y-up).
 * radius slightly > 1 so pings sit above the Earth surface.
 */
export function latLngToVector3(lat, lng, radius = 1.018) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  ];
}
