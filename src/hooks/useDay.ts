import { useEffect, useState } from 'react';
import { createDefaultDay, DayRecord, Stop, loadDay, saveDay } from '../utils/storage';

type UseDayOptions = {
  persist?: boolean;
};

function makeEmptyMiddle(): Stop {
  return { id: crypto.randomUUID(), address: '', org: '', tid: '', reason: '', requestNumber: '', status: 'pending', declineReason: '' };
}

export function useDay(date: string, options: UseDayOptions = {}) {
  const persist = options.persist !== false;

  const [rec, setRec] = useState<DayRecord>(() => {
    if (persist) {
      const loaded = loadDay(date);
      if (!loaded.stops || loaded.stops.length < 3) {
        const defaults = createDefaultDay(date);
        saveDay(defaults);
        return defaults;
      }
      return loaded;
    }
    return createDefaultDay(date);
  });

  // Persist on any change (debounced)
  useEffect(() => {
    if (!persist) return;
    const id = setTimeout(() => saveDay(rec), 200);
    return () => clearTimeout(id);
  }, [persist, rec]);

  // helpers to mutate
  const addMiddleStop = () => {
    const newStop: Stop = makeEmptyMiddle();
    setRec(r => ({
      ...r,
      sent: false,
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
      return { ...r, sent: false, stops: filtered };
    });
  };

  const updateStop = (id: string, patch: Partial<Stop>) => {
    setRec(r => ({
      ...r,
      sent: false,
      stops: r.stops.map(s => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const resetDay = (nextSent = false) => {
    const next = createDefaultDay(date);
    next.sent = nextSent;
    if (!nextSent) {
      next.distanceKm = 0;
    }
    setRec(next);
    if (!persist) return;
    saveDay(next);
  };

  return { rec, setRec, addMiddleStop, removeStop, updateStop, resetDay, persist };
}
