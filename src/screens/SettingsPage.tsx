import { useState } from 'react';
import { loadSettings, saveSettings, type Settings, type ReasonTemplate, getReasonLabel, getReasonColor } from '../utils/settings';
import { loadAll, saveAll } from '../utils/storage';

export default function SettingsPage() {
  const [s, setS] = useState<Settings>(() => loadSettings());
  const [newReason, setNewReason] = useState('');
  const [newColor, setNewColor] = useState('#0C61FD');

  const addReason = () => {
    const val = newReason.trim();
    if (!val) return;
    const item: ReasonTemplate = { label: val, color: newColor };
    setS(prev => ({ ...prev, reasonTemplates: [...prev.reasonTemplates, item] }));
    setNewReason('');
  };

  const removeReason = (val: string) => {
    setS(prev => ({ ...prev, reasonTemplates: prev.reasonTemplates.filter(x => getReasonLabel(x) !== val) }));
  };

  const handleSave = () => {
    saveSettings(s);
    alert('Сохранено');
  };

  return (
    <div className="space-y-3 pb-20">
      <div className="text-xl font-semibold">Настройки</div>

      <div className="card grid gap-3">
        <div>
          <div className="text-sm opacity-70 mb-1">Стартовый адрес (офис)</div>
          <input className="input" value={s.startAddress} onChange={e => setS({ ...s, startAddress: e.target.value })} />
        </div>
        <div>
          <div className="text-sm opacity-70 mb-1">Финишный адрес (офис)</div>
          <input className="input" value={s.endAddress} onChange={e => setS({ ...s, endAddress: e.target.value })} />
        </div>
        <button className="btn btn-primary w-full" onClick={handleSave}>Сохранить</button>
        <div className="text-sm opacity-60">Новые дни будут создаваться с этими офисами. На странице «Сегодня» можно применить настройки к текущему дню кнопкой «Обновить офисы».</div>
      </div>

      <div className="card">
        <div className="font-medium mb-2">Шаблоны причин выезда</div>
        <div className="flex gap-2 mb-3">
          <input className="input" placeholder="Новая причина" value={newReason} onChange={e => setNewReason(e.target.value)} />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} title="Цвет тега"/>
          <button className="btn" onClick={addReason}>Добавить</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.reasonTemplates.map((rt, idx) => {
            const label = getReasonLabel(rt); const color = getReasonColor(rt) || '#94a3b8';
            return (
              <div key={label+idx} className="flex items-center gap-2 px-3 py-1 rounded-full border" style={{ borderColor: color+ '66', backgroundColor: color + '1a' }}>
                <span>{label}</span>
                <input type="color" className="ml-2" value={color} onChange={e => {
                  const cp = [...s.reasonTemplates];
                  cp[idx] = { label, color: e.target.value } as any;
                  setS(prev => ({ ...prev, reasonTemplates: cp }));
                }} />
                <button onClick={() => removeReason(label)} aria-label="Удалить">✕</button>
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <button className="btn btn-primary" onClick={handleSave}>Сохранить шаблоны</button>
        </div>
      </div>

      <div className="card">
        <div className="font-medium mb-2">Бэкап и импорт (опционально)</div>
        <div className="text-sm opacity-70 mb-2">Это локальная копия на случай смены телефона/браузера или если сервер хранит не всю историю.</div>
        <div className="flex gap-2 mb-3">
          <button className="btn" onClick={() => {
            const payload = {
              days: loadAll(),
              settings: s,
              geocache: localStorage.getItem('route.pwa.geocache') || '{}'
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'route-backup.json'; a.click();
            URL.revokeObjectURL(url);
          }}>Скачать JSON</button>
          <label className="btn">
            Импорт JSON
            <input type="file" accept="application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              const text = await f.text();
              try {
                const data = JSON.parse(text);
                if (data.days) saveAll(data.days);
                if (data.settings) { saveSettings(data.settings); setS(data.settings); }
                if (data.geocache) localStorage.setItem('route.pwa.geocache', data.geocache);
                alert('Импорт завершён');
              } catch { alert('Файл повреждён или неверного формата'); }
            }} />
          </label>
        </div>
      </div>
    </div>
  );
}
