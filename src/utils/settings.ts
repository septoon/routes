export type ReasonTemplate = { label: string; color?: string } | string;
export type Settings = {
  startAddress: string;
  endAddress: string;
  reasonTemplates: ReasonTemplate[];
};

const SKEY = 'route.pwa.settings';

const DEFAULTS: Settings = {
  startAddress: 'Алушта, ул. Снежковой 17Б',
  endAddress: 'Алушта, ул. Снежковой 17Б',
  reasonTemplates: [
    { label: 'Сервисная', color: '#4ade80' },
    { label: '(добавление канала WIFI)', color: '#f97316' },
    { label: '(добавление канала Ethernet)', color: '#f59e0b' },
    { label: 'Установка', color: '#f43f5e' },
    { label: 'Обновление ПО', color: '#60a5fa' },
    { label: 'Замена терминала', color: '#a78bfa' },
  ],
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SKEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SKEY, JSON.stringify(s));
}

export function getReasonLabel(rt: ReasonTemplate): string {
  return typeof rt === 'string' ? rt : rt.label;
}
export function getReasonColor(rt: ReasonTemplate): string | undefined {
  return typeof rt === 'string' ? undefined : rt.color;
}
