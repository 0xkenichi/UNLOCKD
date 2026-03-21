const { fetch } = require('undici');
const { hashIp } = require('./utils');

const GEO_LOOKUP_URL = process.env.GEO_LOOKUP_URL || 'https://ipapi.co';
const GEO_LOOKUP_TIMEOUT_MS = Number(process.env.GEO_LOOKUP_TIMEOUT_MS || 2200);
const GEO_CACHE_TTL_MS = Number(process.env.GEO_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const GEO_CACHE_MAX_ITEMS = Number(process.env.GEO_CACHE_MAX_ITEMS || 50000);

const geoLookupCache = new Map();

const isPrivateOrLocalIp = (ip) => {
  if (!ip) return true;
  const normalized = ip.replace(/^::ffff:/, '');
  if (
    normalized === '::1' ||
    normalized === '127.0.0.1' ||
    normalized === 'localhost'
  ) {
    return true;
  }
  if (
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return true;
  }
  return false;
};

const readGeoFromProvider = async (ip) => {
  const url = `${GEO_LOOKUP_URL.replace(/\/$/, '')}/${encodeURIComponent(ip)}/json/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const lat = Number(data?.latitude);
    const lng = Number(data?.longitude);
    const city = data?.city ? String(data.city).trim() : '';
    const state = data?.region ? String(data.region).trim() : null;
    const country = data?.country_name
      ? String(data.country_name).trim()
      : data?.country
        ? String(data.country).trim()
        : '';
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !city || !country) {
      return null;
    }
    return { lat, lng, city, state, country };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const lookupGeoByIp = async (ip) => {
  if (!ip || isPrivateOrLocalIp(ip)) return null;
  const cacheKey = hashIp(ip);
  const cached = geoLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.at < GEO_CACHE_TTL_MS) {
    return cached.value;
  }
  const value = await readGeoFromProvider(ip);
  geoLookupCache.set(cacheKey, { at: Date.now(), value });
  
  if (geoLookupCache.size > GEO_CACHE_MAX_ITEMS) {
      // Basic cleanup
      const cutoff = Date.now() - GEO_CACHE_TTL_MS;
      for (const [key, entry] of geoLookupCache.entries()) {
          if (!entry || entry.at < cutoff) {
              geoLookupCache.delete(key);
          }
      }
  }
  return value;
};

const captureUserGeoPresence = async (persistence, { userId, ip }) => {
  if (!userId || !ip) return;
  try {
    const geo = await lookupGeoByIp(ip);
    if (!geo) return;
    await persistence.upsertUserGeoPresence({
      userId,
      lat: geo.lat,
      lng: geo.lng,
      city: geo.city,
      state: geo.state,
      country: geo.country
    });
  } catch (error) {
    console.warn('[geo] capture failed', error?.message || error);
  }
};

module.exports = {
  lookupGeoByIp,
  captureUserGeoPresence
};
