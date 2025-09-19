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
  requestNumber?: string;
};

export type DayRecord = {
  date: string; // YYYY-MM-DD
  stops: Stop[];
  distanceKm?: number; // optional computed
  sent?: boolean;
};

const KEY = 'route.pwa.days';

function makeStop(overrides: Partial<Stop> = {}): Stop {
  return {
    id: crypto.randomUUID(),
    address: '',
    org: '',
    tid: '',
    reason: '',
    status: 'pending',
    declineReason: '',
    requestNumber: '',
    ...overrides,
  };
}

export function createDefaultDay(date: string): DayRecord {
  const settings = loadSettings();
  const start = makeStop({
    address: settings.startAddress,
    reason: 'Подготовка оборудования',
    status: 'done',
  });
  const finish = makeStop({
    address: settings.endAddress,
    reason: 'Сдача оборудования',
    status: 'done',
  });

  return {
    date,
    distanceKm: 0,
    sent: false,
    stops: [
      start,
      makeStop({ status: 'pending' }),
      finish,
    ],
  };
}

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
    all[date] = createDefaultDay(date);
    saveAll(all);
  }
  return all[date];
}

export function saveDay(rec: DayRecord) {
  const all = loadAll();
  all[rec.date] = rec;
  saveAll(all);
}

export function removeDay(date: string) {
  const all = loadAll();
  if (all[date]) {
    delete all[date];
    saveAll(all);
  }
}
