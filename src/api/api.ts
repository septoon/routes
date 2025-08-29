import axios from 'axios';
import type { DayRecord } from '../utils/storage';

const RAW_API = `${process.env.REACT_APP_API_URL || ''}`.trim();
const DEFAULT_API_ORIGIN = 'https://api.lumastack.ru';
const API_KEY = `${process.env.REACT_APP_API_KEY || ''}`.trim();

function onlyOrigin(u: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.origin;
  } catch {
    return null;
  }
}

function resolveApiOrigin(): string {
  const envOrigin = onlyOrigin(RAW_API);
  if (envOrigin) return envOrigin;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_API_ORIGIN;
}

type Candidate = {
  method: 'post';
  url: string;
  data: any;
  headers: Record<string, string>;
  label: string; // для логов
};

function buildCandidates(_date: string, payload: any): Candidate[] {
  const origin = resolveApiOrigin();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;

  // Только POST к Express — он делает upsert по дате.
  const primaryPost: Candidate   = { method: 'post', url: `${origin}/api/routes`,  data: payload, headers, label: 'primary POST /api/routes' };
  const primarySlash: Candidate  = { method: 'post', url: `${origin}/api/routes/`, data: payload, headers, label: 'primary POST /api/routes/ (slash)' };

  // Жёсткий origin на случай, если RAW_API пуст/битый
  const hard = DEFAULT_API_ORIGIN;
  const hardPost: Candidate      = { method: 'post', url: `${hard}/api/routes`,    data: payload, headers, label: 'HARD POST /api/routes' };

  return [primaryPost, primarySlash, hardPost];
}

// --- Fallback, который НЕ затирает файл ---
// Сначала читаем текущее содержимое, затем обновляем days[date] и пишем обратно.
async function mergePutFallback(date: string, payload: any) {
  const origin = resolveApiOrigin();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;

  let current: any = null;
  const readUrls = [
    `${origin}/api/data/routes.json`, // Express reader
    `${origin}/routes.json`,          // Nginx static
  ];

  for (const u of readUrls) {
    try {
      const r = await axios.get(u, { timeout: 8000, validateStatus: s => s >= 200 && s < 300 });
      current = r.data;
      break;
    } catch {}
  }

  if (!current || typeof current !== 'object') current = {};
  if (!current.days || typeof current.days !== 'object') current.days = {};
  current.days[date] = payload; // upsert конкретного дня

  const writeUrls = [
    { url: `${origin}/api/save/routes.json`, label: 'fallback PUT /api/save/routes.json (Express)' },
    { url: `${origin}/routes.json`,          label: 'fallback PUT /routes.json (nginx direct)'  },
  ];

  for (const w of writeUrls) {
    try {
      const res = await axios.put(w.url, current, {
        headers,
        timeout: 10000,
        validateStatus: s => (s >= 200 && s < 300) || s === 204,
      });
      console.info('[sendDay] OK:', w.label, 'status', res.status);
      return res.data ?? { success: true };
    } catch (e: any) {
      const status: number = typeof e?.response?.status === 'number' ? e.response.status : 0;
      console.warn('[sendDay] FAIL:', w.label, `HTTP ${status}`);
    }
  }
  throw new Error('Fallback PUT failed');
}

export async function sendDay(rec: DayRecord) {
  const payload = {
    date: rec.date,
    stops: rec.stops,
    distanceKm: typeof rec.distanceKm === 'number' ? rec.distanceKm : 0,
    sent: !!rec.sent,
  };

  const candidates = buildCandidates(rec.date, payload);
  let lastErr: any = null;

  try {
    console.debug('[sendDay] origin=', resolveApiOrigin(), 'RAW_API=', RAW_API);
    console.debug('[sendDay] candidates in order:', candidates.map(c => `${c.label} -> ${c.url}`));
  } catch {}

  for (const cfg of candidates) {
    try {
      const res = await axios.request({
        method: cfg.method,
        url: cfg.url,
        data: cfg.data,
        headers: cfg.headers,
        timeout: 15000,
        withCredentials: false,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 204,
      });
      console.info('[sendDay] OK:', cfg.label, '->', cfg.url, 'status', res.status);
      return res.data ?? { success: true };
    } catch (e: any) {
      lastErr = e;
      const status: number = typeof e?.response?.status === 'number' ? e.response.status : 0;
      const msg = (e?.response?.data && (e.response.data.error || e.response.data.message)) || e?.message || '';
      console.warn('[sendDay] FAIL:', cfg.label, '->', cfg.url, `HTTP ${status}`, msg);
      if (status === 401 || status === 403) {
        throw e; // показать настоящую ошибку авторизации
      }
    }
  }

  // Все POST-кандидаты не сработали — используем "умный" fallback с чтением и merge
  return mergePutFallback(rec.date, payload);
}

