import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function humanDate(d: Date): string {
  return format(d, 'd MMMM', { locale: ru });
}
