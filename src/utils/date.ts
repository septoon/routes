import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

/**
 * Returns YYYY-MM-DD in LOCAL time (no toISOString / UTC).
 * Works reliably across time zones and DST.
 */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Human-readable date like "29 августа" in Russian locale.
 * Accepts Date or "YYYY-MM-DD" string.
 */
export function humanDate(d: Date | string): string {
  const date =
    typeof d === 'string'
      // Create date at local noon to avoid any potential timezone edge cases
      ? new Date(`${d}T12:00:00`)
      : d;
  return format(date, 'd MMMM', { locale: ru });
}