/**
 * Sample user ping locations for the globe.
 * lat/lng → 3D positions on unit sphere. count = users at that location.
 */
export const geoPings = [
  { lat: 37.7749, lng: -122.4194, city: 'San Francisco', state: 'California', country: 'USA', count: 1247 },
  { lat: 40.7128, lng: -74.0060, city: 'New York', state: 'New York', country: 'USA', count: 2134 },
  { lat: 51.5074, lng: -0.1278, city: 'London', state: 'England', country: 'UK', count: 892 },
  { lat: 52.5200, lng: 13.4050, city: 'Berlin', state: 'Berlin', country: 'Germany', count: 567 },
  { lat: 48.8566, lng: 2.3522, city: 'Paris', state: 'Île-de-France', country: 'France', count: 734 },
  { lat: 35.6762, lng: 139.6503, city: 'Tokyo', state: 'Tokyo', country: 'Japan', count: 1103 },
  { lat: 22.3193, lng: 114.1694, city: 'Hong Kong', state: null, country: 'Hong Kong', count: 445 },
  { lat: 1.3521, lng: 103.8198, city: 'Singapore', state: null, country: 'Singapore', count: 623 },
  { lat: -33.8688, lng: 151.2093, city: 'Sydney', state: 'NSW', country: 'Australia', count: 312 },
  { lat: 43.6532, lng: -79.3832, city: 'Toronto', state: 'Ontario', country: 'Canada', count: 489 },
  { lat: 37.5665, lng: 126.9780, city: 'Seoul', state: null, country: 'South Korea', count: 534 },
  { lat: 19.0760, lng: 72.8777, city: 'Mumbai', state: 'Maharashtra', country: 'India', count: 678 },
  { lat: 25.2048, lng: 55.2708, city: 'Dubai', state: 'Dubai', country: 'UAE', count: 256 },
  { lat: -23.5505, lng: -46.6333, city: 'São Paulo', state: 'São Paulo', country: 'Brazil', count: 412 },
  { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', state: 'California', country: 'USA', count: 890 },
  { lat: 41.8781, lng: -87.6298, city: 'Chicago', state: 'Illinois', country: 'USA', count: 534 },
  { lat: 52.3676, lng: 4.9041, city: 'Amsterdam', state: 'North Holland', country: 'Netherlands', count: 345 },
  { lat: 37.9838, lng: 23.7275, city: 'Athens', state: 'Attica', country: 'Greece', count: 189 },
  { lat: 59.3293, lng: 18.0686, city: 'Stockholm', state: 'Stockholm', country: 'Sweden', count: 278 },
];

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
