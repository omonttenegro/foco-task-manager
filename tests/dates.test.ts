import { describe, expect, it } from 'vitest';
import { monthCalendarDays } from '../src/lib/dates';

describe('dias visíveis no calendário mensal', () => {
  it('não acrescenta uma semana totalmente fora do mês', () => {
    const days = monthCalendarDays('2026-10-22', 1);

    expect(days).toHaveLength(35);
    expect(days[0]).toBe('2026-09-28');
    expect(days.at(-1)).toBe('2026-11-01');
  });

  it('mantém seis semanas quando o mês realmente precisa delas', () => {
    const days = monthCalendarDays('2026-08-15', 1);

    expect(days).toHaveLength(42);
    expect(days[0]).toBe('2026-07-27');
    expect(days.at(-1)).toBe('2026-09-06');
  });
});
