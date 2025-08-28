import { loadSettings } from './settings';

export type StopStatus = 'pending' | 'done' | 'declined';

export type Stop = {
  id: string;
  address: string;
  org: string;
  tid: string;
  reason: string;
  status?: StopStatus;
  declineReason?: string;
};

export type DayRecord = {
  date: string; // YYYY-MM-DD
  stops: Stop[];
  distanceKm?: number; // optional computed
  sent?: boolean;
};

const KEY = 'route.pwa.days';

export function loadAll(): Record<string, DayRecord> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveAll(obj: Record<string, DayRecord>) {
  localStorage.setItem(KEY, JSON.stringify(obj));
}

export function loadDay(date: string): DayRecord {
  const all = loadAll();
  if (!all[date]) {
    const s = loadSettings();
    const startAddr = s.startAddress;
    const endAddr = s.endAddress;
    all[date] = {
      date,
      stops: [
        { id: crypto.randomUUID(), address: startAddr, org: '', tid: '', reason: 'Подготовка оборудования' },
        { id: crypto.randomUUID(), address: endAddr, org: '', tid: '', reason: 'Сдача оборудования' },
      ],
    };
    saveAll(all);
  }
  return all[date];
}

export function saveDay(rec: DayRecord) {
  const all = loadAll();
  all[rec.date] = rec;
  saveAll(all);
}
