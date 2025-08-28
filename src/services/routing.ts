import axios from 'axios';
import type { DayRecord } from '../utils/storage';

type Coord = { lat: number; lon: number };

const ORS_KEY = process.env.REACT_APP_ORS_KEY; // optional
const OSRM_URL = process.env.REACT_APP_OSRM_URL || 'https://router.project-osrm.org'; // fallback
const NOMINATIM_URL = process.env.REACT_APP_NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

// --- local cache for geocoding ---
const GCACHE_KEY = 'route.pwa.geocache';
function loadGeoCache(): Record<string, Coord> {
  try { const raw = localStorage.getItem(GCACHE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function saveGeoCache(obj: Record<string, Coord>) { localStorage.setItem(GCACHE_KEY, JSON.stringify(obj)); }

async function geocode(address: string): Promise<Coord> {
  const cache = loadGeoCache();
  if (cache[address]) return cache[address];

  let coord: Coord | null = null;

  try {
    if (ORS_KEY) {
      const url = `https://api.openrouteservice.org/geocode/search`;
      const params: any = { text: address, api_key: ORS_KEY, size: 1 };
      // optional bounding by country via dotted key requires quotes
      params['boundary.country'] = 'RU';
      const r = await axios.get(url, { params });
      const f = r.data?.features?.[0];
      if (f) { coord = { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }; }
    }
  } catch {}

  if (!coord) {
    // Fallback to Nominatim
    const r = await axios.get(`${NOMINATIM_URL}/search`, { params: { q: address, format: 'json', limit: 1, addressdetails: 0 } });
    const first = r.data?.[0];
    if (!first) throw new Error('Адрес не найден: ' + address);
    coord = { lat: parseFloat(first.lat), lon: parseFloat(first.lon) };
  }

  const cache2 = loadGeoCache();
  cache2[address] = coord;
  saveGeoCache(cache2);
  return coord;
}

async function routeDistanceKm(coords: Coord[]): Promise<number> {
  if (coords.length < 2) return 0;

  // Prefer ORS if key provided
  if (ORS_KEY) {
    const url = `https://api.openrouteservice.org/v2/directions/driving-car`;
    const body = { coordinates: coords.map(c => [c.lon, c.lat]) };
    const r = await axios.post(url, body, { headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' } });
    const meters = r.data?.routes?.[0]?.summary?.distance;
    if (typeof meters === 'number') return meters / 1000;
  }

  // Fallback OSRM
  const coordsStr = coords.map(c => `${c.lon},${c.lat}`).join(';');
  const r2 = await axios.get(`${OSRM_URL}/route/v1/driving/${coordsStr}`, { params: { overview: 'false' } });
  const meters2 = r2.data?.routes?.[0]?.distance;
  if (typeof meters2 === 'number') return meters2 / 1000;

  throw new Error('Маршрут не найден');
}

export async function computeDistanceForDay(rec: DayRecord): Promise<number> {
  const coords: Coord[] = [];
  for (const s of rec.stops) {
    const c = await geocode(s.address || '');
    coords.push(c);
  }
  const km = await routeDistanceKm(coords);
  return km;
}
