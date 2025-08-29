import { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

function toYMD(d: Date) { return format(d, 'yyyy-MM-dd'); }

const API_URL = process.env.REACT_APP_API_URL || '';

function getCandidates(): string[] {
  const list: string[] = [];
  try {
    const u = new URL(API_URL);
    const origin = u.origin;
    list.push(`${origin}/api/data/routes.json`); // Express file API
    list.push(`${origin}/routes.json`);          // NGINX direct file
  } catch {
    // API_URL может быть пуст или относительный — используем текущий origin
    const origin = window.location.origin;
    list.push(`${origin}/api/data/routes.json`);
    list.push(`${origin}/routes.json`);
  }
  // как последний шанс — относительные пути (полезно на GH Pages)
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
        headers: { 'Accept': 'application/json' },
        timeout: 12000,
        withCredentials: false,
        // не шлём кастомные заголовки, чтобы не триггерить CORS preflight
      });
      console.info('[export] Loaded from', url);
      return res.data;
    } catch (e: any) {
      lastErr = e;
      console.warn('[export] Failed', url, e?.message || e);
      // пробуем следующий URL
    }
  }
  throw lastErr || new Error('Не удалось загрузить routes.json ни по одному из URL');
}

export default function ExportPage() {
  const [from, setFrom] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [to, setTo] = useState<Date>(new Date());

  const [serverDays, setServerDays] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetchRoutesJSON()
      .then((data) => {
        if (cancelled) return;
        let days: Record<string, any> = {};
        if (data && typeof data === 'object') {
          if (Array.isArray(data)) {
            // array of day objects with .date
            data.forEach((d: any) => { if (d && d.date) days[d.date] = d; });
          } else if (data.days && typeof data.days === 'object') {
            days = data.days as Record<string, any>;
          } else {
            // maybe it's already a map of date -> rec
            days = data as Record<string, any>;
          }
        }
        setServerDays(days || {});
      })
      .catch((err: any) => {
        if (cancelled) return;
        const status = err?.response?.status;
        const msg = status ? `HTTP ${status}` : (err?.message || 'Не удалось получить данные с сервера');
        setError(msg);
        setServerDays({});
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = Object.values(serverDays).filter((rec: any) => {
    const k = rec.date;
    return k >= toYMD(from) && k <= toYMD(to);
  }).sort((a, b) => a.date.localeCompare(b.date));

  const handleExportXLSX = () => {
    const rows: any[] = [];
    for (const rec of filtered) {
      rec.stops.forEach((s: any, idx: number) => {
        rows.push({
          Дата: rec.date,
          Порядок: idx + 1,
          Адрес: s.address,
          'Название ИП': s.org,
          TID: s.tid,
          'Причина выезда': s.reason,
          'Отправлено': rec.sent ? 'Да' : 'Нет',
          'Дистанция, км': rec.distanceKm ?? ''
        });
      });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Маршруты');
    XLSX.writeFile(wb, `routes_${toYMD(from)}_${toYMD(to)}.xlsx`);
  };

  const rows = filtered.flatMap((rec: any) => rec.stops.map((s: any, idx: number) => ({
    date: rec.date,
    order: idx + 1,
    address: s.address,
    org: s.org,
    tid: s.tid,
    reason: s.reason,
    status: s.status === 'done' ? 'Выполнена' : s.status === 'declined' ? 'Отказ' : 'В процессе',
    decline: s.declineReason || '',
    sent: rec.sent ? 'Да' : 'Нет',
    distance: idx === 1 ? (rec.distanceKm ?? '') : ''
  })));

  const handleExportCSV = () => {
    const header = ['Дата','Порядок','Адрес','Название ИП','TID','Причина выезда','Статус','Причина отказа','Отправлено','Дистанция, км'];
    const csvRows = [header.join(';')];
    rows.forEach(r => csvRows.push([r.date, r.order, r.address, r.org, r.tid, r.reason, r.status, r.decline, r.sent, r.distance].map(v => String(v).replace(/;/g, ',')).join(';')));
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `routes_${toYMD(from)}_${toYMD(to)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 pt-10 pb-24">
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
          <div>Записей дней: <b>{filtered.length}</b></div>
          <div className="flex gap-2">
            <button className="btn" onClick={handleExportCSV}>Скачать CSV</button>
            <button className="btn btn-primary" onClick={handleExportXLSX}>Скачать Excel</button>
          </div>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="text-sm opacity-70 mb-2">Предпросмотр таблицы</div>

        {loading && <div className="text-sm opacity-70">Загружаю данные с сервера…</div>}
        {!loading && error && (
          <div className="text-sm text-red-500">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-sm opacity-70">На сервере нет записей за выбранный период.</div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            {/* Desktop / tablet: таблица */}
            <div className="hidden md:block overflow-x-auto -mx-2 px-2">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="text-left opacity-70 sticky top-0 bg-black/5 dark:bg-white/5 backdrop-blur">
                  <tr>
                    <th className="pr-3 py-1">Дата</th>
                    <th className="pr-3 py-1">#</th>
                    <th className="pr-3 py-1">Адрес</th>
                    <th className="pr-3 py-1">Название ИП</th>
                    <th className="pr-3 py-1">TID</th>
                    <th className="pr-3 py-1">Причина выезда</th>
                    <th className="pr-3 py-1">Статус</th>
                    <th className="pr-3 py-1">Причина отказа</th>
                    <th className="pr-3 py-1">Отправлено</th>
                    <th className="pr-3 py-1">Дистанция, км</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-black/5 dark:border-white/10 even:bg-white/5">
                      <td className="pr-3 py-1 whitespace-nowrap">{r.date}</td>
                      <td className="pr-3 py-1">{r.order}</td>
                      <td className="pr-3 py-1">{r.address}</td>
                      <td className="pr-3 py-1">{r.org}</td>
                      <td className="pr-3 py-1">{r.tid}</td>
                      <td className="pr-3 py-1">{r.reason}</td>
                      <td className="pr-3 py-1 whitespace-nowrap">{r.status}</td>
                      <td className="pr-3 py-1">{r.decline}</td>
                      <td className="pr-3 py-1">{r.sent}</td>
                      <td className="pr-3 py-1">{r.distance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: карточки */}
            <div className="md:hidden grid gap-2">
              {rows.map((r, i) => (
                <div key={i} className="rounded-2xl border border-black/10 dark:border-white/10 p-3 bg-white/60 dark:bg-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium">{r.date}</div>
                    <div className="text-xs opacity-60">#{r.order}</div>
                  </div>
                  <div className="text-sm mb-1"><span className="opacity-60">Адрес: </span>{r.address || '—'}</div>
                  {r.org ? <div className="text-sm mb-1"><span className="opacity-60">ИП/ООО: </span>{r.org}</div> : null}
                  {r.tid ? <div className="text-sm mb-1"><span className="opacity-60">TID: </span>{r.tid}</div> : null}
                  {r.reason ? <div className="text-sm mb-1"><span className="opacity-60">Причина: </span>{r.reason}</div> : null}
                  <div className="text-sm mb-1"><span className="opacity-60">Статус: </span>{r.status}</div>
                  {r.decline ? <div className="text-sm mb-1"><span className="opacity-60">Отказ: </span>{r.decline}</div> : null}
                  <div className="text-xs opacity-70 flex items-center gap-3 mt-1">
                    <span>Отправлено: <b>{r.sent}</b></span>
                    {r.distance !== '' ? <span>Дистанция: <b>{r.distance}</b> км</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
