import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CalendarPicker from '../components/CalendarPicker';
import StopCard from '../components/StopCard';
import { humanDate, ymd } from '../utils/date';
import { useDay } from '../hooks/useDay';
import { buildSendPayload, fetchDay, sendDay } from '../api/api';
import { computeDistanceForDay } from '../services/routing';
import { DragDropContext, Droppable, Draggable, DropResult, DroppableProvided, DraggableProvided } from '@hello-pangea/dnd';
import { loadAll } from '../utils/storage';
import type { DayRecord } from '../utils/storage';
import { enqueue } from '../utils/queue';
import { getRegistration } from '../serviceWorkerRegistration';

export default function HomePage() {
  const [selected, setSelected] = useState<Date>(new Date());
  const dateKey = useMemo(() => ymd(selected), [selected]);
  const todayKey = ymd(new Date());
  const isToday = dateKey === todayKey;
  const { rec, setRec, addMiddleStop, removeStop, updateStop, resetDay, persist } = useDay(dateKey, { persist: isToday });
  const [addressOptions, setAddressOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const recRef = useRef(rec);
  const autoSendTimerRef = useRef<number | null>(null);

  useEffect(() => {
    recRef.current = rec;
  }, [rec]);

  // Suggestions from history
  useEffect(() => {
    const addresses = new Set<string>();
    const all = loadAll();
    Object.values(all).forEach((d) => d.stops.forEach((s) => {
      if (s.address && s.address.trim()) addresses.add(s.address.trim());
    }));
    rec.stops.forEach((s) => {
      if (s.address && s.address.trim()) addresses.add(s.address.trim());
    });
    setAddressOptions(Array.from(addresses).sort().slice(0, 100));
  }, [dateKey, rec.stops.map((s) => s.address).join('|')]);

  const hasDataToSend = useCallback((record: DayRecord | null) => {
    if (!record || !Array.isArray(record.stops)) return false;
    if (record.stops.length < 3) return false;
    const lastIdx = record.stops.length - 1;
    return record.stops.some((stop, idx) => {
      if (idx === 0 || idx === lastIdx) return false;
      const address = (stop.address || '').trim();
      const number = (stop.requestNumber || '').trim();
      return address.length > 0 || number.length > 0;
    });
  }, []);

  const handleSend = useCallback(async (options?: { skipConfirm?: boolean; silent?: boolean }) => {
    const skipConfirm = !!options?.skipConfirm;
    const silent = !!options?.silent;
    const currentRec = recRef.current;

    if (!currentRec) return;
    if (!persist) {
      if (!silent) alert('Отправка доступна только для сегодняшнего дня.');
      return;
    }
    if (!hasDataToSend(currentRec)) {
      if (!silent) alert('Нет данных для отправки');
      return;
    }
    if (!skipConfirm && !window.confirm('Вы уверены, что хотите отправить отчёт?')) return;

    setSending(true);
    try {
      const payload = buildSendPayload(currentRec, dateKey);
      await sendDay(payload);
      resetDay(true);
      if (!silent) alert('Отправлено!');
    } catch (e: any) {
      console.error('sendDay failed', e?.response?.status, e?.response?.data || e?.message);
      const status: number = typeof e?.response?.status === 'number' ? e.response.status : 0;
      const msg = (e?.response?.data && (e.response.data.error || e.response.data.message)) || e?.message || '';

      if (status === 401 || status === 403) {
        if (!silent) {
          alert('Сервер отклонил запрос (Unauthorized). Проверь API на сервере. В .env клиента ключ не обязателен.');
        }
        return;
      }
      if (status === 404) {
        if (!silent) {
          alert('Эндпоинт не найден (404). Проверь, что на api доступен /api/routes (Express) или /api/save/routes.json (fallback).');
        }
        return;
      }

      // Только при инфраструктурных проблемах ставим в очередь
      if ([0, 502, 503, 504].includes(status)) {
        enqueue(currentRec.date);
        const r = await getRegistration();
        try { await (r as any)?.sync?.register('send-queued-days'); } catch {}
        if (!silent) {
          alert('Сети нет или сервер недоступен. Заявка поставлена в очередь и будет отправлена автоматически.');
        }
      } else if (!silent) {
        alert(`Не удалось отправить: HTTP ${status}${msg ? ` — ${msg}` : ''}`);
      }
    } finally {
      setSending(false);
    }
  }, [dateKey, hasDataToSend, persist, resetDay, setRec]);

  const scheduleAutoSend = useCallback((runImmediately: boolean) => {
    if (!persist) return;

    if (autoSendTimerRef.current) {
      window.clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }

    if (recRef.current?.sent) return;
    if (!hasDataToSend(recRef.current)) return;

    const trigger = async () => {
      if (recRef.current?.sent) return;
      if (!hasDataToSend(recRef.current)) return;
      await handleSend({ skipConfirm: true, silent: true });
      if (!recRef.current?.sent) {
        scheduleAutoSend(false);
      }
    };

    if (runImmediately) {
      autoSendTimerRef.current = window.setTimeout(trigger, 0);
      return;
    }

    const now = new Date();
    const next = new Date();
    next.setHours(22, 0, 0, 0);
    if (now >= next) {
      next.setDate(next.getDate() + 1);
    }

    const delay = next.getTime() - now.getTime();
    autoSendTimerRef.current = window.setTimeout(trigger, delay);
  }, [handleSend, hasDataToSend, persist]);

  useEffect(() => {
    if (!persist) {
      if (autoSendTimerRef.current) {
        window.clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }
      return;
    }

    if (rec.sent) {
      if (autoSendTimerRef.current) {
        window.clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }
      return;
    }

    const now = new Date();
    const next = new Date();
    next.setHours(22, 0, 0, 0);
    const shouldSendNow = now >= next;
    scheduleAutoSend(shouldSendNow);

    return () => {
      if (autoSendTimerRef.current) {
        window.clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }
    };
  }, [dateKey, persist, rec.sent, scheduleAutoSend]);

  useEffect(() => {
    let cancelled = false;
    const fetchAndApply = async () => {
      if (isToday) return;
      try {
        const serverRec = await fetchDay(dateKey);
        if (cancelled) return;
        if (!serverRec) return;

        setRec((prev) => ({
          ...prev,
          ...serverRec,
          date: dateKey,
        }));
      } catch (err) {
        console.warn('Не удалось загрузить маршрут с сервера', err);
      }
    };

    fetchAndApply();

    return () => {
      cancelled = true;
    };
  }, [dateKey, isToday, setRec]);

  // Auto distance recompute (debounced)
  useEffect(() => {
    const addresses = rec.stops.map((s) => (s.address || '').trim());
    if (addresses.length < 2 || addresses.some((a) => !a)) return;
    const t = setTimeout(async () => {
      try {
        setBusy(true);
        const km = await computeDistanceForDay(recRef.current);
        setRec((prev) => ({ ...prev, distanceKm: km }));
      } catch (err) {
        console.warn('Автоподсчёт дистанции не удался', err);
      } finally {
        setBusy(false);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [rec.stops.map((s) => s.address).join('|'), setRec]);

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
          </div>
          <div className="text-sm opacity-70 mt-1 flex items-center gap-2">
            Дистанция: <b>{typeof rec.distanceKm === 'number' ? rec.distanceKm.toFixed(1) : '—'}</b> км {busy && <span className="spinner" aria-label="Расчёт..."></span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarPicker selected={selected} onSelect={setSelected} />
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

      <div className="flex gap-2 mt-2">
        <button className="btn btn-primary w-full font-bold ml-auto" onClick={() => handleSend()} disabled={sending || !persist || !hasDataToSend(rec)}>
          {sending ? 'Отправляю…' : 'Отправить'}
        </button>
      </div>

      <datalist id="address-list">
        {addressOptions.map((o, i) => (<option key={i} value={o} />))}
      </datalist>

    </div>
  );
}
