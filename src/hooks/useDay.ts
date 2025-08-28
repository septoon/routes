import { useEffect, useState } from 'react';
import { loadSettings } from '../utils/settings';
import { DayRecord, Stop, loadDay, saveDay } from '../utils/storage';

export function useDay(date: string) {
  const [rec, setRec] = useState<DayRecord>(() => {
    let r = loadDay(date);
    const s = loadSettings();
    const makeEmptyMiddle = (): Stop => ({ id: crypto.randomUUID(), address: '', org: '', tid: '', reason: '' });

    if (!r || !Array.isArray(r.stops) || r.stops.length === 0) {
      r = {
        date,
        distanceKm: r?.distanceKm ?? 0,
        sent: r?.sent ?? false,
        stops: [
          { id: crypto.randomUUID(), address: s.startAddress, org: '', tid: '', reason: 'Подготовка оборудования' },
          makeEmptyMiddle(),
          { id: crypto.randomUUID(), address: s.endAddress, org: '', tid: '', reason: 'Сдача оборудования' },
        ],
      } as DayRecord;
      saveDay(r);
    } else if (r.stops.length === 2) {
      // если по ошибке только старт/финиш – вставим пустую середину
      r.stops.splice(1, 0, makeEmptyMiddle());
      saveDay(r);
    }
    // гарантируем фиксированные причины у офисных точек
    if (r.stops.length >= 2) {
      r.stops[0] = { ...r.stops[0], address: s.startAddress, reason: 'Подготовка оборудования' };
      r.stops[r.stops.length - 1] = { ...r.stops[r.stops.length - 1], address: s.endAddress, reason: 'Сдача оборудования' };
    }
    return r;
  });

  // Persist on any change (debounced)
  useEffect(() => {
    const id = setTimeout(() => saveDay(rec), 200);
    return () => clearTimeout(id);
  }, [rec]);

  // helpers to mutate
  const addMiddleStop = () => {
    const newStop: Stop = { id: crypto.randomUUID(), address: '', org: '', tid: '', reason: '' };
    setRec(r => ({
      ...r,
      stops: [...r.stops.slice(0, -1), newStop, r.stops[r.stops.length - 1]],
    }));
  };

  const removeStop = (id: string) => {
    setRec(r => {
      // Нельзя удалять, если всего три точки (старт, одна середина, финиш)
      if (r.stops.length <= 3) return r;
      const firstId = r.stops[0].id;
      const lastId = r.stops[r.stops.length - 1].id;
      if (id === firstId || id === lastId) return r; // защита на всякий случай
      const filtered = r.stops.filter(s => s.id !== id);
      return { ...r, stops: filtered };
    });
  };

  const updateStop = (id: string, patch: Partial<Stop>) => {
    setRec(r => ({ ...r, stops: r.stops.map(s => (s.id === id ? { ...s, ...patch } : s)) }));
  };

  return { rec, setRec, addMiddleStop, removeStop, updateStop };
}
