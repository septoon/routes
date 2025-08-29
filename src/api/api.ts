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
  // 1) origin из переменной окружения (если в ней был путь — он будет отброшен)
  const envOrigin = onlyOrigin(RAW_API);
  if (envOrigin) return envOrigin;

  // 2) origin текущего приложения
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  // 3) запасной вариант
  return DEFAULT_API_ORIGIN;
}

type Candidate = {
  method: 'post' | 'put';
  url: string;
  data: any;
  headers: Record<string, string>;
  label: string; // для логов
};

function buildCandidates(date: string, payload: any): Candidate[] {
  const origin = resolveApiOrigin();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;

  const primaryPost: Candidate = { method: 'post', url: `${origin}/api/routes`, data: payload, headers, label: 'primary POST /api/routes' };
  const primaryPut: Candidate  = { method: 'put',  url: `${origin}/api/routes`, data: payload, headers, label: 'primary PUT /api/routes' };
  const primarySlash: Candidate = { method: 'post', url: `${origin}/api/routes/`, data: payload, headers, label: 'primary POST /api/routes/ (slash)' };

  // Файловый fallback (совместим с nginx location ~ ^/([a-zA-Z0-9_-]+\.json)$ и Express /api/save/:fileName)
  const filePutApi: Candidate    = { method: 'put', url: `${origin}/api/save/routes.json`, data: { days: { [date]: payload } }, headers, label: 'fallback PUT /api/save/routes.json (Express)' };
  const fileDirectNginx: Candidate = { method: 'put', url: `${origin}/routes.json`, data: { days: { [date]: payload } }, headers, label: 'fallback PUT /routes.json (nginx direct)' };

  // Жёсткий origin на случай, если RAW_API пуст/битый
  const hard = DEFAULT_API_ORIGIN;
  const hardPost: Candidate   = { method: 'post', url: `${hard}/api/routes`, data: payload, headers, label: 'HARD POST /api/routes' };
  const hardPut: Candidate    = { method: 'put',  url: `${hard}/api/routes`, data: payload, headers, label: 'HARD PUT /api/routes' };
  const hardFilePut: Candidate = { method: 'put', url: `${hard}/api/save/routes.json`, data: { days: { [date]: payload } }, headers, label: 'HARD PUT /api/save/routes.json' };

  return [
    primaryPost,
    primaryPut,
    primarySlash,
    filePutApi,
    fileDirectNginx,
    hardPost,
    hardPut,
    hardFilePut,
  ];
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

  // Диагностика: покажем какие урлы будем пробовать
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
        // 2xx и 204 считаем успехом
        validateStatus: (s) => (s >= 200 && s < 300) || s === 204,
      });
      console.info('[sendDay] OK:', cfg.label, '->', cfg.url, 'status', res.status);
      return res.data ?? { success: true };
    } catch (e: any) {
      lastErr = e;
      const status: number = typeof e?.response?.status === 'number' ? e.response.status : 0;
      const msg = (e?.response?.data && (e.response.data.error || e.response.data.message)) || e?.message || '';
      console.warn('[sendDay] FAIL:', cfg.label, '->', cfg.url, `HTTP ${status}`, msg);

      // Если это ошибка авторизации — не пробуем дальше, чтобы пользователь увидел настоящий 401/403
      if (status === 401 || status === 403) {
        throw e;
      }
      // иначе продолжаем к следующему кандидату
    }
  }

  // Если дошли сюда — никто не ответил
  throw lastErr || new Error('Не удалось отправить данные: все кандидаты не ответили.');
}
