import { useCallback, useEffect, useState } from 'react';
import { createDefaultDay, DayRecord, Stop, StopStatus, loadDay, saveDay } from '../utils/storage';

type UseDayOptions = {
  persist?: boolean;
};

function makeEmptyMiddle(): Stop {
  return {
    id: crypto.randomUUID(),
    address: '',
    org: '',
    tid: '',
    reason: '',
    requestNumber: '',
    status: 'pending',
    declineReason: '',
  };
}

function normalizeStatus(value: unknown, fallback: StopStatus): StopStatus {
  if (value === 'pending' || value === 'done' || value === 'declined') return value;
  if (typeof value === 'string') {
    const low = value.toLowerCase();
    if (low.includes('decline') || low.includes('отказ')) return 'declined';
    if (low.includes('done') || low.includes('выполн')) return 'done';
  }
  return fallback;
}

function hydrateStops(raw: Stop[] | undefined, base: Stop[]): Stop[] {
  const firstReason = base[0]?.reason || 'Подготовка оборудования';
  const lastReason = base[base.length - 1]?.reason || 'Сдача оборудования';

  if (!Array.isArray(raw) || raw.length === 0) {
    return base.map((s, idx) => ({
      ...s,
      status: idx === 0 || idx === base.length - 1 ? 'done' : 'pending',
      reason: idx === 0 ? firstReason : idx === base.length - 1 ? lastReason : s.reason,
    }));
  }

  const cloned = raw.map((stop, idx, arr) => {
    const isEdge = idx === 0 || idx === arr.length - 1;
    const fallbackStatus: StopStatus = isEdge ? 'done' : 'pending';
    return {
      id: stop.id || base[idx]?.id || crypto.randomUUID(),
      address: stop.address || '',
      org: stop.org || '',
      tid: stop.tid || '',
      reason: stop.reason || '',
      requestNumber: stop.requestNumber || '',
      declineReason: stop.declineReason || '',
      status: normalizeStatus(stop.status, fallbackStatus),
    } as Stop;
  });

  if (cloned.length < 2) {
    return base.map((s, idx) => ({
      ...s,
      status: idx === 0 || idx === base.length - 1 ? 'done' : 'pending',
      reason: idx === 0 ? firstReason : idx === base.length - 1 ? lastReason : s.reason,
    }));
  }

  if (cloned.length === 2) {
    const middleTemplate = base[1] ? { ...base[1] } : makeEmptyMiddle();
    cloned.splice(1, 0, middleTemplate);
  }

  // Ensure edge stops always have default reasons if пусто
  const lastIdx = cloned.length - 1;
  cloned[0] = {
    ...cloned[0],
    reason: cloned[0].reason || firstReason,
    status: 'done',
  };
  cloned[lastIdx] = {
    ...cloned[lastIdx],
    reason: cloned[lastIdx].reason || lastReason,
    status: 'done',
  };

  return cloned;
}

function buildDay(date: string, persist: boolean): DayRecord {
  const base = createDefaultDay(date);
  if (!persist) return base;

  const stored = loadDay(date);
  const normalized: DayRecord = {
    date,
    distanceKm: typeof stored.distanceKm === 'number' ? stored.distanceKm : base.distanceKm,
    sent: !!stored.sent,
    stops: hydrateStops(stored.stops, base.stops),
  };
  return normalized;
}

export function useDay(date: string, options: UseDayOptions = {}) {
  const persist = options.persist !== false;

  const [rec, setRec] = useState<DayRecord>(() => buildDay(date, persist));

  useEffect(() => {
    const next = buildDay(date, persist);
    setRec(next);
    if (persist) {
      saveDay(next);
    }
  }, [date, persist]);

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

  const resetDay = useCallback((nextSent = false) => {
    const next = createDefaultDay(date);
    next.sent = nextSent;
    if (!nextSent) {
      next.distanceKm = 0;
    }
    setRec(next);
    if (!persist) return;
    saveDay(next);
  }, [date, persist]);

  return { rec, setRec, addMiddleStop, removeStop, updateStop, resetDay, persist };
}
