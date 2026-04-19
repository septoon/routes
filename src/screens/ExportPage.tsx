import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { buildRoutesReportEntries, normalizeFuelReportEntries, type FuelReportEntry, type RouteReportEntry } from '../utils/report';
import type { DayRecord } from '../utils/storage';

function toYMD(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

const API_URL = process.env.REACT_APP_API_URL || '';
const REPORT_BUDGET = 'СЕ-2025-000037324';

function getCandidates(): string[] {
  const list: string[] = [];
  try {
    const u = new URL(API_URL);
    const origin = u.origin;
    list.push(`${origin}/api/data/routes.json`);
    list.push(`${origin}/routes.json`);
  } catch {
    const origin = window.location.origin;
    list.push(`${origin}/api/data/routes.json`);
    list.push(`${origin}/routes.json`);
  }
  list.push('/api/data/routes.json');
  list.push('/routes.json');
  return Array.from(new Set(list));
}

async function fetchRoutesJSON(): Promise<any> {
  const candidates = getCandidates();
  let lastErr: any = null;
  for (const url of candidates) {
    try {
      const res = await axios.get(url, {
        headers: { Accept: 'application/json' },
        timeout: 12000,
        withCredentials: false,
      });
      console.info('[export] Loaded from', url);
      return res.data;
    } catch (e: any) {
      lastErr = e;
      console.warn('[export] Failed', url, e?.message || e);
    }
  }
  throw lastErr || new Error('Не удалось загрузить routes.json ни по одному из URL');
}

function extractDays(payload: any): Record<string, DayRecord> {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.days && typeof payload.days === 'object') {
    return payload.days as Record<string, DayRecord>;
  }
  if (Array.isArray(payload)) {
    return payload.reduce((acc: Record<string, DayRecord>, item: any) => {
      if (item?.date) acc[item.date] = item as DayRecord;
      return acc;
    }, {});
  }
  return payload as Record<string, DayRecord>;
}

function extractRouteEntries(payload: any): RouteReportEntry[] {
  if (Array.isArray(payload?.routes)) {
    return payload.routes as RouteReportEntry[];
  }
  return buildRoutesReportEntries(extractDays(payload));
}

type ReportData = {
  routes: RouteReportEntry[];
  fuelEntries: FuelReportEntry[];
};

export default function ExportPage() {
  const [from, setFrom] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [to, setTo] = useState<Date>(new Date());

  const [reportData, setReportData] = useState<ReportData>({ routes: [], fuelEntries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRoutesJSON()
      .then((data) => {
        if (cancelled) return;
        setReportData({
          routes: extractRouteEntries(data).sort((a, b) => a.date.localeCompare(b.date)),
          fuelEntries: normalizeFuelReportEntries(data?.fuel_entries),
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        const status = err?.response?.status;
        const msg = status ? `HTTP ${status}` : err?.message || 'Не удалось получить данные с сервера';
        setError(msg);
        setReportData({ routes: [], fuelEntries: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const range = useMemo(() => {
    const start = toYMD(from);
    const end = toYMD(to);
    return { start: start <= end ? start : end, end: start <= end ? end : start };
  }, [from, to]);

  const filteredRoutes = useMemo(
    () => reportData.routes.filter((item) => item.date >= range.start && item.date <= range.end),
    [range.end, range.start, reportData.routes]
  );

  const filteredFuelEntries = useMemo(
    () => reportData.fuelEntries.filter((item) => item.fuel_date >= range.start && item.fuel_date <= range.end),
    [range.end, range.start, reportData.fuelEntries]
  );

  const routePreview = filteredRoutes.map((row) => ({
    date: row.date,
    formattedDate: format(parseISO(row.date), 'dd.MM.yyyy'),
    distanceLabel: row.distance_km.toLocaleString('ru-RU'),
    routeLabel: row.route || '—',
    requestNumbersLabel: row.request_numbers || '—',
    odometerLabel: row.period_start_odometer.toLocaleString('ru-RU'),
  }));

  const handleExportXLSX = () => {
    const routeRows = filteredRoutes.map((row) => ({
      date: row.date,
      distance_km: row.distance_km,
      route: row.route,
      request_numbers: row.request_numbers,
      period_start_odometer: row.period_start_odometer,
      budget: REPORT_BUDGET,
    }));

    const fuelRows = filteredFuelEntries.map((row) => ({
      fuel_date: row.fuel_date,
      fuel_liters: row.fuel_liters,
      fuel_cost_rub: row.fuel_cost_rub,
      budget: REPORT_BUDGET,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(routeRows), 'ПЛ-ТК');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelRows), 'Отчет по ТК');
    XLSX.writeFile(wb, `luma_report_${range.start}_${range.end}.xlsx`);
  };

  const handleExportCSV = () => {
    const header = ['date', 'distance_km', 'route', 'request_numbers', 'period_start_odometer', 'budget'];
    const csvRows = [header.join(';')];

    filteredRoutes.forEach((row) => {
      csvRows.push(
        [
          row.date,
          row.distance_km,
          row.route,
          row.request_numbers,
          row.period_start_odometer,
          REPORT_BUDGET,
        ]
          .map((value) => String(value).replace(/;/g, ','))
          .join(';')
      );
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luma_routes_${range.start}_${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 pb-24 pt-10 w-full">
      <div className="text-xl font-semibold">Экспорт</div>

      <div className="card grid gap-3">
        <div className="date-grid grid grid-cols-2 gap-3 items-stretch">
          <div>
            <div className="text-sm opacity-70 mb-1">С даты</div>
            <input
              type="date"
              className="input date-ios w-full"
              value={toYMD(from)}
              onChange={(e) => setFrom(new Date(e.target.value))}
            />
          </div>
          <div>
            <div className="text-sm opacity-70 mb-1">По дату</div>
            <input
              type="date"
              className="input date-ios w-full"
              value={toYMD(to)}
              onChange={(e) => setTo(new Date(e.target.value))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            Маршрутов: <b>{filteredRoutes.length}</b> · Заправок: <b>{filteredFuelEntries.length}</b>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={handleExportCSV}>Скачать CSV</button>
            <button className="btn btn-primary" onClick={handleExportXLSX}>Скачать Excel</button>
          </div>
        </div>

        <div className="text-sm opacity-70">Бюджет в Excel фиксированный: {REPORT_BUDGET}</div>
      </div>

      <div className="card overflow-hidden">
        <div className="text-sm opacity-70 mb-2">Предпросмотр листа ПЛ-ТК</div>

        {loading && <div className="text-sm opacity-70">Загружаю данные с сервера…</div>}
        {!loading && error && <div className="text-sm text-red-500">{error}</div>}
        {!loading && !error && filteredRoutes.length === 0 && (
          <div className="text-sm opacity-70">На сервере нет записей за выбранный период.</div>
        )}

        {!loading && !error && filteredRoutes.length > 0 && (
          <div className="hidden md:block overflow-x-auto -mx-2 px-2">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="text-left opacity-70 sticky top-0 bg-black/5 dark:bg-white/5 backdrop-blur">
                <tr>
                  <th className="pr-3 py-1">Дата</th>
                  <th className="pr-3 py-1">Пробег</th>
                  <th className="pr-3 py-1">Маршрут</th>
                  <th className="pr-3 py-1">Заявки</th>
                  <th className="pr-3 py-1">Одометр</th>
                </tr>
              </thead>
              <tbody>
                {routePreview.map((row) => (
                  <tr key={row.date} className="border-t border-black/5 dark:border-white/10 even:bg-white/5">
                    <td className="pr-3 py-1 whitespace-nowrap">{row.formattedDate}</td>
                    <td className="pr-3 py-1 whitespace-nowrap">{row.distanceLabel}</td>
                    <td className="pr-3 py-1">{row.routeLabel}</td>
                    <td className="pr-3 py-1">{row.requestNumbersLabel}</td>
                    <td className="pr-3 py-1 whitespace-nowrap">{row.odometerLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
