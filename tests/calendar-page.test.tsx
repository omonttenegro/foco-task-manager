// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/types';
import { CalendarPage } from '../src/pages/CalendarPage';
import { today } from '../src/lib/dates';

vi.mock('../src/context/AppContext', () => ({
  useApp: () => ({ mutate: vi.fn() }),
}));

const timestamp = '2026-10-26T00:00:00.000Z';

function calendarState(): AppState {
  const date = today();
  return {
    categories: [{ id: 'faculdade', name: 'Faculdade', color: '#ef2b87', icon: null, archived: false, createdAt: timestamp, updatedAt: timestamp }],
    projects: [],
    tasks: [{
      id: 'teste', title: 'Teste 2025', description: '', categoryId: 'faculdade', projectId: null,
      parentTaskId: null, status: 'todo', priority: null, deadline: null, estimatedDuration: 90,
      completedAt: null, archived: false, position: 0, createdAt: timestamp, updatedAt: timestamp,
    }],
    dependencies: [],
    sessions: [{ id: 'sessao', taskId: 'teste', plannedDate: date, plannedDuration: 90, completedDuration: null, status: 'planned', position: 0, createdAt: timestamp, updatedAt: timestamp }],
    settings: { theme: 'light', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 },
  };
}

describe('Calendário semanal', () => {
  it('deixa o gesto horizontal para o scroll e não torna as sessões arrastáveis', () => {
    render(<CalendarPage state={calendarState()} onOpenTask={vi.fn()} onModal={vi.fn()} />);

    const session = screen.getByRole('button', { name: /Teste 2025/i });
    expect(session).toHaveClass('calendar-session-card');
    expect(session).not.toHaveAttribute('aria-roledescription', 'draggable');
    expect(session).not.toHaveAttribute('aria-describedby');
    expect(session).not.toHaveAttribute('style');
  });
});
