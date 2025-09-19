import axios from 'axios';
import { createDefaultDay, DayRecord, Stop, StopStatus } from '../utils/storage';

export type SendDayPayload = {
  date: string;
  distanceKm: number;
  sent: boolean;
  stops: Array<{
    id: string;
    address: string;
    org: string;
    tid: string;
    reason: string;
    status: string;
    rejectReason: string;
    requestNumber: string;
  }>;
};

const STATUS_TO_LABEL: Record<StopStatus, string> = {
  done: 'Выполнена',
  declined: 'Отказ',
  pending: 'В процессе',
};

function statusToLabel(status?: string | null): string {
  if (!status) return STATUS_TO_LABEL.done;
  if (status in STATUS_TO_LABEL) {
    return STATUS_TO_LABEL[status as StopStatus];
  }
  return String(status);
}

export function buildSendPayload(record: DayRecord, dateOverride?: string): SendDayPayload {
  const date = dateOverride || record.date;
  const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

  return {
    date,
    distanceKm: typeof record.distanceKm === 'number' ? record.distanceKm : 0,
    sent: !!record.sent,
    stops: (record.stops || []).map((stop) => ({
      id: stop.id,
      address: clean(stop.address),
      org: clean(stop.org),
      tid: clean(stop.tid),
      reason: clean(stop.reason),
      status: statusToLabel(stop.status),
      rejectReason: clean(stop.declineReason || (stop as any).rejectReason || ''),
      requestNumber: clean(stop.requestNumber),
    })),
  };
}

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

function buildCandidates(_date: string, payload: SendDayPayload): Candidate[] {
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

function buildRoutesReadCandidates(): string[] {
  const origin = resolveApiOrigin();
  const list: string[] = [
    `${origin}/api/data/routes.json`,
    `${origin}/routes.json`,
  ];

  if (origin !== DEFAULT_API_ORIGIN) {
    list.push(`${DEFAULT_API_ORIGIN}/api/data/routes.json`);
    list.push(`${DEFAULT_API_ORIGIN}/routes.json`);
  }

  list.push('/api/data/routes.json');
  list.push('/routes.json');

  return Array.from(new Set(list));
}

// --- Fallback, который НЕ затирает файл ---
// Сначала читаем текущее содержимое, затем обновляем days[date] и пишем обратно.
async function mergePutFallback(date: string, payload: SendDayPayload) {
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

export async function sendDay(rec: SendDayPayload) {
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

type RawStop = Partial<Stop> & {
  rejectReason?: string;
};

type RawDay = {
  date?: string;
  distanceKm?: number;
  sent?: boolean;
  stops?: RawStop[];
};

function extractDayFromPayload(payload: any, date: string): RawDay | null {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    const match = payload.find((item: any) => item && item.date === date);
    return match || null;
  }
  if (payload.days && typeof payload.days === 'object') {
    return payload.days[date] || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, date)) {
    return payload[date];
  }
  return null;
}

function normalizeStatus(value: unknown): StopStatus {
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (lowered.includes('decline') || lowered.includes('отказ')) return 'declined';
    if (lowered.includes('done') || lowered.includes('выполн')) return 'done';
  }
  if (value === 'declined') return 'declined';
  if (value === 'done') return 'done';
  return 'pending';
}

function normalizeStop(raw: RawStop): Stop {
  return {
    id: raw.id || crypto.randomUUID(),
    address: typeof raw.address === 'string' ? raw.address : '',
    org: typeof raw.org === 'string' ? raw.org : '',
    tid: typeof raw.tid === 'string' ? raw.tid : '',
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    status: normalizeStatus(raw.status),
    declineReason: typeof raw.declineReason === 'string'
      ? raw.declineReason
      : typeof raw.rejectReason === 'string'
        ? raw.rejectReason
        : '',
    requestNumber: typeof raw.requestNumber === 'string' ? raw.requestNumber : '',
  };
}

function normalizeRemoteDay(raw: RawDay | null, date: string): DayRecord | null {
  if (!raw) return null;
  const base = createDefaultDay(date);
  const stops = Array.isArray(raw.stops) && raw.stops.length
    ? raw.stops.map(normalizeStop)
    : base.stops;

  return {
    date,
    stops,
    distanceKm: typeof raw.distanceKm === 'number' ? raw.distanceKm : base.distanceKm,
    sent: !!raw.sent,
  };
}

export async function fetchDay(date: string): Promise<DayRecord | null> {
  const candidates = buildRoutesReadCandidates();
  let lastErr: any = null;

  for (const url of candidates) {
    try {
      const res = await axios.get(url, {
        headers: { Accept: 'application/json' },
        timeout: 12000,
        withCredentials: false,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
      });

      const day = normalizeRemoteDay(extractDayFromPayload(res.data, date), date);
      if (day) return day;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    try {
      const status = (lastErr as any)?.response?.status;
      const msg = (lastErr as any)?.message;
      console.warn('[fetchDay] Unable to load day', date, status || '', msg || '');
    } catch {}
  }

  return null;
}
