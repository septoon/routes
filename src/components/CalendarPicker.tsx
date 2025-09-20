import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { ru } from 'date-fns/locale';

type Props = {
  selected: Date;
  onSelect: (d: Date) => void;
};

export default function CalendarPicker({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="btn btn-tonal"
        onClick={() => setOpen(!open)}
      >
        📅
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 z-50 card shadow-lg"
          style={{ width: 'min(340px, calc(100vw - 3rem))', maxWidth: 'calc(100vw - 3rem)' }}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => d && (onSelect(d), setOpen(false))}
            locale={ru}
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
}
