import { Stop } from '../utils/storage';

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
            <input className="input" placeholder="Адрес" value={stop.address} onChange={e => onChange({ address: e.target.value })} list={"address-list"} />

            <label className="text-sm opacity-70">Номер заявки</label>
            <input className="input" placeholder="Номер заявки" value={stop.requestNumber || ''} onChange={e => onChange({ requestNumber: e.target.value })} />
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
