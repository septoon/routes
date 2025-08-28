import axios from 'axios';
import type { DayRecord } from '../utils/storage';

const API_URL = `${process.env.REACT_APP_API_URL || ''}`;
const API_KEY = `${process.env.REACT_APP_API_KEY || ''}`; // не обязателен — добавится только если задан

function buildEndpoints() {
  if (!API_URL) throw new Error('REACT_APP_API_URL не задан в .env');
  let origin = '';
  try {
    const u = new URL(API_URL);
    origin = u.origin; // https://api.lumastack.ru
  } catch {
    // если пришёл относительный путь — берём текущий origin
    origin = window.location.origin;
  }
  const primary = `${origin}/api/routes`;           // новый express-эндпоинт (POST upsert)
  const fallback = `${origin}/api/save/routes.json`; // совместимость: PUT целиком в файл
  return { primary, fallback };
}

export async function sendDay(rec: DayRecord) {
  const { primary, fallback } = buildEndpoints();
  const payload = {
    date: rec.date,
    stops: rec.stops,
    distanceKm: rec.distanceKm ?? null,
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY; // добавим только если есть

  // 1) Пытаемся основной эндпоинт
  try {
    const res = await axios.post(primary, payload, { headers, timeout: 12000 });
    return res.data;
  } catch (e: any) {
    const statusNum: number = typeof e?.response?.status === 'number' ? e.response.status : 0; // 0 — network error/таймаут/CORS

    // Лог в консоль для диагностики
    console.error('[sendDay] primary failed', { url: primary, status: statusNum, message: e?.message, data: e?.response?.data });

    // 2) Решение: используем fallback при большинстве инфраструктурных ошибок:
    // 404/405 — маршрут не найден/метод не поддерживается
    // 5xx — сервер недоступен или падает за прокси
    // 0   — network error/таймаут/CORS (браузер не дал статус)
    const shouldFallback = [0, 404, 405, 500, 501, 502, 503, 504].includes(statusNum);

    // Не делаем fallback только при 401/403 (ошибка авторизации) — их важно показать пользователю
    if (!shouldFallback || statusNum === 401 || statusNum === 403) {
      throw e;
    }

    try {
      const res2 = await axios.put(
        fallback,
        { days: { [rec.date]: payload } },
        { headers, timeout: 12000 }
      );
      return res2.data;
    } catch (e2: any) {
      console.error('[sendDay] fallback failed', { url: fallback, status: e2?.response?.status ?? 0, message: e2?.message, data: e2?.response?.data });
      throw e2; // отдадим дальше — пусть UI поставит в очередь
    }
  }
}
