import { useEffect, useMemo, useState } from 'react';
import { DayRecord, Stop, loadDay, saveDay } from '../utils/storage';

export function useDay(date: string) {
  const [rec, setRec] = useState<DayRecord>(() => loadDay(date));

  // Persist on any change (debounced)
  useEffect(() => {
    const id = setTimeout(() => saveDay(rec), 200);
    return () => clearTimeout(id);
  }, [rec]);

  // helpers to mutate
  const addMiddleStop = () => {
    const newStop: Stop = { id: crypto.randomUUID(), address: '', org: '', tid: '', reason: '' };
    setRec(r => ({ ...r, stops: [...r.stops.slice(0, -1), newStop, r.stops[r.stops.length - 1]] }));
  };

  const removeStop = (id: string) => {
    setRec(r => {
      const first = r.stops[0].id;
      const last = r.stops[r.stops.length - 1].id;
      // don't remove first/last
      const filtered = r.stops.filter(s => s.id !== id || s.id === first || s.id === last);
      return { ...r, stops: filtered };
    });
  };

  const updateStop = (id: string, patch: Partial<Stop>) => {
    setRec(r => ({ ...r, stops: r.stops.map(s => (s.id === id ? { ...s, ...patch } : s)) }));
  };

  return { rec, setRec, addMiddleStop, removeStop, updateStop };
}
