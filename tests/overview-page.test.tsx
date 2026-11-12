// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppState, Task } from '../shared/types';
import { OverviewPage } from '../src/pages/OverviewPage';
import { today } from '../src/lib/dates';

vi.mock('../src/context/AppContext', () => ({
  useApp: () => ({ mutate: vi.fn(), notify: vi.fn() }),
}));

const timestamp = '2026-10-27T00:00:00.000Z';
const task = (id: string, title: string, deadline: string | null = null): Task => ({
  id, title, description: '', categoryId: null, projectId: null, parentTaskId: null,
  status: 'todo', priority: null, deadline, estimatedDuration: null, completedAt: null,
  archived: false, position: 0, createdAt: timestamp, updatedAt: timestamp,
});

describe('Hoje', () => {
  it('junta tarefas planeadas e com deadline hoje sem duplicados', () => {
    const day = today();
    const state: AppState = {
      categories: [], projects: [], dependencies: [],
      tasks: [task('planeada', 'Planeada hoje'), task('deadline', 'Deadline hoje', day), task('ambas', 'Planeada e com deadline', day)],
      sessions: [
        { id: 's1', taskId: 'planeada', plannedDate: day, plannedDuration: 30, completedDuration: null, status: 'planned', position: 0, createdAt: timestamp, updatedAt: timestamp },
        { id: 's2', taskId: 'ambas', plannedDate: day, plannedDuration: 45, completedDuration: null, status: 'planned', position: 1, createdAt: timestamp, updatedAt: timestamp },
      ],
      settings: { theme: 'light', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 },
    };

    render(<OverviewPage state={state} onOpenTask={vi.fn()} />);

    expect(screen.getByText('Planeada hoje')).toBeInTheDocument();
    expect(screen.getByText('Deadline hoje')).toBeInTheDocument();
    expect(screen.getAllByText('Planeada e com deadline')).toHaveLength(1);
    expect(screen.getAllByText('Prazo hoje')).toHaveLength(1);
    expect(document.querySelector('[data-task-id="deadline"]')).toHaveClass('deadline-unplanned');
    expect(document.querySelector('[data-task-id="ambas"]')).not.toHaveClass('deadline-unplanned');
    expect(screen.getByText('3', { selector: '.home-summary strong' })).toBeInTheDocument();
    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
  });

  it('mostra todas as tarefas atrasadas sem limitar a secção a cinco linhas', () => {
    const state: AppState = {
      categories: [], projects: [], dependencies: [], sessions: [],
      tasks: Array.from({ length: 8 }, (_, index) => task(`late-${index}`, `Atrasada ${index + 1}`, '2020-01-01')),
      settings: { theme: 'light', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 },
    };

    render(<OverviewPage state={state} onOpenTask={vi.fn()} />);

    expect(screen.getByText('Atrasada 8')).toBeInTheDocument();
    expect(document.querySelectorAll('.section-late [data-task-id]')).toHaveLength(8);
  });

  it('não conta nem mostra subtarefas de uma tarefa principal concluída', () => {
    const parent = { ...task('parent', 'Principal', '2020-01-01'), status: 'done' as const, completedAt: timestamp };
    const child = { ...task('child', 'Subtarefa atrasada', '2020-01-01'), parentTaskId: parent.id };
    const state: AppState = {
      categories: [], projects: [], dependencies: [], sessions: [], tasks: [parent, child],
      settings: { theme: 'light', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 },
    };

    const { container } = render(<OverviewPage state={state} onOpenTask={vi.fn()} />);

    expect(screen.queryByText('Subtarefa atrasada')).not.toBeInTheDocument();
    expect(container.querySelector('.home-summary span:nth-child(2) strong')).toHaveTextContent('0');
  });
});
