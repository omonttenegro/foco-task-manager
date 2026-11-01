import { addDays, addMonths, endOfMonth, format, isValid, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { pt } from 'date-fns/locale';

export const today = () => format(new Date(), 'yyyy-MM-dd');
export const fromDay = (value: string) => parseISO(`${value}T12:00:00`);
export const toDay = (value: Date) => format(value, 'yyyy-MM-dd');
export const plusDays = (value: string, amount: number) => toDay(addDays(fromDay(value), amount));
export const moveMonth = (value: string, amount: number) => toDay(addMonths(startOfMonth(fromDay(value)), amount));
export const weekStart = (value: string, weekStartsOn: 0 | 1) => toDay(startOfWeek(fromDay(value), { weekStartsOn }));
export const monthStart = (value: string) => toDay(startOfMonth(fromDay(value)));
export const monthEnd = (value: string) => toDay(endOfMonth(fromDay(value)));
export const monthCalendarDays = (value: string, weekStartsOn: 0 | 1) => {
  const first = weekStart(monthStart(value), weekStartsOn);
  const last = plusDays(weekStart(monthEnd(value), weekStartsOn), 6);
  const days: string[] = [];
  for (let date = first; date <= last; date = plusDays(date, 1)) days.push(date);
  return days;
};
export const dayLabel = (value: string, pattern = 'd MMM') => isValid(fromDay(value)) ? format(fromDay(value), pattern, { locale: pt }) : '';
export const longDay = (value: string) => dayLabel(value, "EEEE, d 'de' MMMM");
