// lib/localizer.ts
import { dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek as dfStartOfWeek, getDay } from 'date-fns';
import { de } from 'date-fns/locale';

export const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => dfStartOfWeek(date, { weekStartsOn: 1, locale: de }),
  getDay,
  locales: { de },
});
