import { Stop } from '../utils/storage';
import { loadSettings, getReasonLabel, getReasonColor } from "../utils/settings";

type Props = {
  stop: Stop;
  readonlyFirstLast?: boolean;
  onChange: (patch: Partial<Stop>) => void;
  addMiddleStop?: () => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
};

export default function StopCard({ stop, readonlyFirstLast, onChange, addMiddleStop, onRemove, onDuplicate }: Props) {
  const isOffice = !!readonlyFirstLast;

  return (
    <div className="card mb-3">
      <div className="grid gap-2">
        {isOffice ? (
          <>
            <label className="text-sm opacity-70">Адрес</label>
            <input className="input" value={stop.address} readOnly />
            <label className="text-sm opacity-70">Причина</label>
            <input className="input" value={stop.reason || ''} readOnly />
          </>
        ) : (
          <>
            <label className="text-sm opacity-70">Адрес</label>
            <input className="input" placeholder="Адрес" value={stop.address} onChange={e => onChange({ address: e.target.value })} />

            <label className="text-sm opacity-70">Название ИП</label>
            <input className="input" placeholder="ООО/ИП" value={stop.org} onChange={e => onChange({ org: e.target.value })} list={"org-list"} />


            <label className="text-sm opacity-70">TID</label>
            <input className="input" placeholder="ID терминала" value={stop.tid} onChange={e => onChange({ tid: e.target.value })} list={"tid-list"} />

            <label className="text-sm opacity-70 flex items-center justify-between">Причина выезда
              <span className="text-xs opacity-60">(шаблоны ниже)</span>
            </label>
            <div className="flex items-center gap-2">
              <input className="input" placeholder="Описание" value={stop.reason} onChange={e => onChange({ reason: e.target.value })} list={"reasons-list"} />
              {(() => { 
                const t = loadSettings().reasonTemplates.find(rt => getReasonLabel(rt) === stop.reason); 
                if (!t) return null; 
                const c = getReasonColor(t); 
                return c ? <span title="Цвет тега" style={{ backgroundColor: c }} className="inline-block w-4 h-4 rounded-full border border-black/10 dark:border-white/20"></span> : null; 
              })()}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {loadSettings().reasonTemplates.map((t, i) => {
                const label = getReasonLabel(t); const color = getReasonColor(t);
                const style: any = color ? { backgroundColor: color + "22", borderColor: color + "55", color: color } : {};
                return (
                  <button type="button" key={i} className="chip border" style={style}
                    onClick={() => onChange({ reason: label })}>{label}</button>
                );
              })}
            </div>

            <div className="mt-3 grid gap-2">
              <div className="text-sm opacity-70">Статус</div>
              <div className="flex gap-2">
                <button type="button"
                  className={`btn ${stop.status === 'done' ? 'btn-primary' : 'btn-tonal'}`}
                  onClick={() => onChange({ status: 'done', declineReason: '' })}>Выполнена</button>
                <button type="button"
                  className={`btn ${stop.status === 'declined' ? 'btn-primary' : 'btn-tonal'}`}
                  onClick={() => onChange({ status: 'declined' })}>Отказ</button>
                <button type="button"
                  className={`btn ${!stop.status || stop.status === 'pending' ? 'btn-primary' : 'btn-tonal'}`}
                  onClick={() => onChange({ status: 'pending', declineReason: '' })}>В процессе</button>
              </div>
              {stop.status === 'declined' && (
                <div>
                  <div className="text-sm opacity-70 mb-1">Причина отказа (необязательно)</div>
                  <input className="input" placeholder="Комментарий" value={stop.declineReason || ''}
                    onChange={e => onChange({ declineReason: e.target.value })} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {(!isOffice && (onRemove || onDuplicate)) && (
        <div className="mt-3 py-3 flex flex-col justify-start gap-2">
          {onDuplicate && <button className="btn" onClick={onDuplicate}>Дублировать</button>}
          {onRemove && (
            <button
              className="btn btn-delete text-white mt-3"
              onClick={() => {
                if (window.confirm('Удалить эту точку?')) onRemove();
              }}
            >
              Удалить точку
            </button>
          )}
          <div className='mt-3'><button className='btn btn-add text-white w-full' onClick={addMiddleStop}>Добавить адрес</button></div>
        </div>
      )}
             
    </div>
  );
}
