import axios from 'axios';
import type { DayRecord } from '../utils/storage';

const API_URL = `${process.env.REACT_APP_API_URL || ''}`;
const API_KEY = `${process.env.REACT_APP_API_KEY || ''}`;

function buildEndpoints() {
  if (!API_URL) throw new Error('REACT_APP_API_URL не задан в .env');
  let origin = '';
  try {
    const u = new URL(API_URL);
    origin = u.origin; // https://api.lumastack.ru
  } catch {
    // если вдруг пришёл относительный путь — работаем с текущим origin
    origin = window.location.origin;
  }
  const primary = `${origin}/api/routes`; // новый express-эндпоинт
  const fallback = `${origin}/api/save/routes.json`; // старый путь (PUT целиком в файл)
  return { primary, fallback };
}

export async function sendDay(rec: DayRecord) {
  const { primary, fallback } = buildEndpoints();
  const payload = {
    date: rec.date,
    stops: rec.stops,
    distanceKm: rec.distanceKm ?? null,
  };
  const headers: any = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;

  try {
    // Пытаемся новый API: POST /api/routes (upsert)
    const res = await axios.post(primary, payload, { headers });
    return res.data;
  } catch (e: any) {
    const status = e?.response?.status;
    // Если эндпоинт не найден — пытаемся совместимостью: PUT /api/save/routes.json
    if (status === 404) {
      const res2 = await axios.put(fallback, { days: { [rec.date]: payload } }, { headers });
      return res2.data;
    }
    throw e;
  }
}
