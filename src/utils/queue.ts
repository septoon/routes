import { DayRecord } from './storage';
import { buildSendPayload, sendDay } from '../api/api';

const QKEY = 'route.pwa.queue';

export type QueueItem = { date: string };

export function loadQueue(): QueueItem[] {
  try { const raw = localStorage.getItem(QKEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export function saveQueue(q: QueueItem[]) {
  localStorage.setItem(QKEY, JSON.stringify(q));
}

export function enqueue(date: string) {
  const q = loadQueue();
  if (!q.find(x => x.date === date)) {
    q.push({ date });
    saveQueue(q);
  }
}

export function dequeue(date: string) {
  const q = loadQueue().filter(x => x.date !== date);
  saveQueue(q);
}

export async function processQueue(loadDay: (d: string) => DayRecord, onSuccess?: (d: string) => void) {
  if (!navigator.onLine) return;
  const q = loadQueue();
  for (const item of q) {
    try {
      const rec = loadDay(item.date);
      const payload = buildSendPayload(rec, item.date);
      await sendDay(payload);
      dequeue(item.date);
      onSuccess && onSuccess(item.date);
    } catch (e) {
      // stop processing to avoid tight loop; will retry later
      break;
    }
  }
}
