import { useEffect, useMemo, useState } from 'react';
import CalendarPicker from '../components/CalendarPicker';
import StopCard from '../components/StopCard';
import { humanDate, ymd } from '../utils/date';
import { useDay } from '../hooks/useDay';
import { sendDay } from '../api/api';
import { loadSettings } from '../utils/settings';
import { computeDistanceForDay } from '../services/routing';
import { DragDropContext, Droppable, Draggable, DropResult, DroppableProvided, DraggableProvided } from '@hello-pangea/dnd';
import { loadAll } from '../utils/storage';
import { enqueue } from '../utils/queue';
import { getRegistration } from '../serviceWorkerRegistration';

function normalizeForSend(r: any, date: string) {
  const clean = (v: any) => (typeof v === 'string' ? v.trim() : v ?? '');
  return {
    date, // всегда отправляем выбранную дату, а не то, что случайно лежит в записи
    distanceKm: typeof r.distanceKm === 'number' ? r.distanceKm : 0,
    sent: !!r.sent,
    stops: (r.stops || []).map((s: any) => ({
      id: s.id,
      address: clean(s.address),
      org: clean(s.org),
      tid: clean(s.tid),
      reason: clean(s.reason),
      status: clean(s.status) || 'Выполнена',
      rejectReason: clean(s.rejectReason || ''),
    })),
  };
}

export default function HomePage() {
  const [selected, setSelected] = useState<Date>(new Date());
  const dateKey = useMemo(() => ymd(selected), [selected]);
  const { rec, setRec, addMiddleStop, removeStop, updateStop } = useDay(dateKey);
  const [orgOptions, setOrgOptions] = useState<string[]>([]);
  const [tidOptions, setTidOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  // Suggestions from history
  useEffect(() => {
    const all = loadAll();
    const orgs = new Set<string>();
    const tids = new Set<string>();
    Object.values(all).forEach((d) => d.stops.forEach((s) => {
      if (s.org && s.org.trim()) orgs.add(s.org.trim());
      if (s.tid && s.tid.trim()) tids.add(s.tid.trim());
    }));
    setOrgOptions(Array.from(orgs).sort().slice(0, 50));
    setTidOptions(Array.from(tids).sort().slice(0, 50));
  }, [dateKey]);

  const handleApplyDefaults = () => {
    const s = loadSettings();
    setRec((r) => {
      if (!r.stops || r.stops.length < 2) return r;
      const firstIdx = 0;
      const lastIdx = r.stops.length - 1;
      const updated = r.stops.map((st, idx) => {
        if (idx === firstIdx) return { ...st, address: s.startAddress, reason: 'Подготовка оборудования' };
        if (idx === lastIdx) return { ...st, address: s.endAddress, reason: 'Сдача оборудования' };
        return st;
      });
      return { ...r, stops: updated };
    });
    alert('Офисы обновлены');
  };

  const handleComputeDistance = async () => {
    setBusy(true);
    try {
      const km = await computeDistanceForDay(rec);
      setRec({ ...rec, distanceKm: km });
    } catch (e: any) {
      alert('Не удалось рассчитать расстояние: ' + (e?.message || 'ошибка'));
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!window.confirm('Вы уверены, что хотите отправить отчёт?')) return;
    setSending(true);
    try {
      const payload = normalizeForSend(rec, dateKey);
      await sendDay(payload as any);
      setRec({ ...rec, sent: true });
      alert('Отправлено!');
    } catch (e: any) {
      console.error('sendDay failed', e?.response?.status, e?.response?.data || e?.message);
      const status: number = typeof e?.response?.status === 'number' ? e.response.status : 0;
      const msg = (e?.response?.data && (e.response.data.error || e.response.data.message)) || e?.message || '';

      if (status === 401 || status === 403) {
        alert('Сервер отклонил запрос (Unauthorized). Проверь API на сервере. В .env клиента ключ не обязателен.');
        return;
      }
      if (status === 404) {
        alert('Эндпоинт не найден (404). Проверь, что на api доступен /api/routes (Express) или /api/save/routes.json (fallback).');
        return;
      }

      // Только при инфраструктурных проблемах ставим в очередь
      if ([0, 502, 503, 504].includes(status)) {
        enqueue(rec.date);
        const r = await getRegistration();
        try { await (r as any)?.sync?.register('send-queued-days'); } catch {}
        alert('Сети нет или сервер недоступен. Заявка поставлена в очередь и будет отправлена автоматически.');
      } else {
        alert(`Не удалось отправить: HTTP ${status}${msg ? ` — ${msg}` : ''}`);
      }
    } finally {
      setSending(false);
    }
  };

  // Auto distance recompute (debounced)
  useEffect(() => {
    const addresses = rec.stops.map((s) => (s.address || '').trim());
    if (addresses.length < 2 || addresses.some((a) => !a)) return;
    const t = setTimeout(async () => {
      try {
        setBusy(true);
        const km = await computeDistanceForDay(rec);
        setRec({ ...rec, distanceKm: km });
      } finally {
        setBusy(false);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [rec.stops.map((s) => s.address).join('|')]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === 0 || from === rec.stops.length - 1) return;
    if (to === 0 || to === rec.stops.length - 1) return;
    setRec((r) => {
      const arr = [...r.stops];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...r, stops: arr };
    });
  };

  return (
    <div className="space-y-3 pt-10 pb-24">
      
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-semibold">{humanDate(selected)}</div>
            {rec.sent && <span className="badge bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">Отправлено</span>}
          </div>
          <div className="text-sm opacity-70 mt-1 flex items-center gap-2">
            Дистанция: <b>{typeof rec.distanceKm === 'number' ? rec.distanceKm.toFixed(1) : '—'}</b> км {busy && <span className="spinner" aria-label="Расчёт..."></span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarPicker selected={selected} onSelect={setSelected} />
          <button className="btn btn-tonal text-sm" onClick={handleApplyDefaults} title="Применить старт/финиш из настроек">Обновить офисы</button>
        </div>
      </div>

      <div className="mt-2">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="stops">
            {(provided: DroppableProvided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {rec.stops.map((s, idx) => (
                  <Draggable key={s.id} draggableId={s.id} index={idx} isDragDisabled={idx===0 || idx===rec.stops.length-1}>
                    {(prov: DraggableProvided) => (
                      <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                        <StopCard
                          stop={s}
                          readonlyFirstLast={idx===0 || idx===rec.stops.length-1}
                          onChange={(patch) => updateStop(s.id, patch)}
                          addMiddleStop={addMiddleStop}
                          onRemove={(() => {
                            const middleCount = Math.max(0, rec.stops.length - 2);
                            if (idx === 0 || idx === rec.stops.length - 1) return undefined; // старт/финиш нельзя
                            if (middleCount <= 1) return undefined; // единственную промежуточную нельзя
                            return () => {
                              if (window.confirm('Удалить этот адрес?')) {
                                removeStop(s.id);
                              }
                            };
                          })()}
                          onDuplicate={idx!==rec.stops.length-1 ? () => setRec(r => ({...r, stops: [...r.stops.slice(0, idx+1), {...s, id: crypto.randomUUID()}, ...r.stops.slice(idx+1)] })) : undefined}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      <div className="mt-2">
</div>

<div className="flex gap-2 mt-2">
  <button className="btn btn-tonal" onClick={handleComputeDistance} disabled={busy}>{busy ? 'Считаю...' : 'Рассчитать дистанцию'}</button>
  <button className="btn btn-primary w-full font-bold ml-auto" onClick={handleSend} disabled={sending}>
    {sending ? 'Отправляю…' : 'Отправить'}
  </button>
</div>

<datalist id="org-list">
        {orgOptions.map((o,i)=>(<option key={i} value={o} />))}
      </datalist>
      <datalist id="tid-list">
        {tidOptions.map((t,i)=>(<option key={i} value={t} />))}
      </datalist>


    </div>
  );
}
