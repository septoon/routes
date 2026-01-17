import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CalendarPicker from '../components/CalendarPicker';
import StopCard from '../components/StopCard';
import { humanDate, ymd } from '../utils/date';
import { useDay } from '../hooks/useDay';
import { buildSendPayload, fetchDay, sendDay } from '../api/api';
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
  const { rec, setRec, addMiddleStop, removeStop, updateStop, resetDay } = useDay(dateKey);
  const [addressOptions, setAddressOptions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const recRef = useRef(rec);

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
  }, [dateKey, hasDataToSend, resetDay, setRec]);

  useEffect(() => {
    if (isToday) return;
    const currentRec = recRef.current;
    const hasLocalData = currentRec && currentRec.date === dateKey
      ? hasDataToSend(currentRec) && !currentRec.sent
      : false;
    if (hasLocalData) return;

    let cancelled = false;
    const fetchAndApply = async () => {
      try {
        const serverRec = await fetchDay(dateKey);
        if (cancelled || !serverRec) return;
        setRec(serverRec);
      } catch (err) {
        console.warn('Не удалось загрузить маршрут с сервера', err);
      }
    };

    fetchAndApply();

    return () => {
      cancelled = true;
    };
  }, [dateKey, hasDataToSend, isToday, setRec]);

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
    <div className="flex flex-col gap-4 pb-24 pt-10 w-full">
      
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-semibold">{humanDate(selected)}</div>
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
        <button className="btn btn-primary w-full font-bold ml-auto" onClick={() => handleSend()} disabled={sending || !hasDataToSend(rec)}>
          {sending ? 'Отправляю…' : 'Отправить'}
        </button>
      </div>

      <datalist id="address-list">
        {addressOptions.map((o, i) => (<option key={i} value={o} />))}
      </datalist>

    </div>
  );
}
