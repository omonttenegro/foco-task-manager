// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/types';
import { HistoryPage } from '../src/pages/HistoryPage';

const appMocks = vi.hoisted(() => ({ mutate: vi.fn(), notify: vi.fn() }));

vi.mock('../src/context/AppContext', () => ({
  useApp: () => ({ mutate: appMocks.mutate, notify: appMocks.notify, busy: false }),
}));

const timestamp = '2026-11-01T10:00:00.000Z';
const state: AppState = {
  categories: [{ id: 'faculdade', name: 'Faculdade', color: '#ef2b87', icon: '🎓', archived: false, createdAt: timestamp, updatedAt: timestamp }],
  projects: [{ id: 'exame', categoryId: 'faculdade', name: 'Exame de Física', description: '', color: null, archived: true, createdAt: timestamp, updatedAt: timestamp }],
  tasks: [
    { id: 'feita', title: 'Resolver ficha 1', description: '', categoryId: 'faculdade', projectId: 'exame', parentTaskId: null, status: 'done', priority: null, deadline: null, estimatedDuration: null, completedAt: timestamp, archived: false, position: 0, createdAt: timestamp, updatedAt: timestamp },
    { id: 'pendente', title: 'Resolver exercício extra', description: '', categoryId: 'faculdade', projectId: 'exame', parentTaskId: 'feita', status: 'todo', priority: null, deadline: null, estimatedDuration: null, completedAt: null, archived: false, position: 0, createdAt: timestamp, updatedAt: timestamp },
  ],
  dependencies: [],
  sessions: [],
  settings: { theme: 'light', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 },
};

describe('histórico de grupos concluídos', () => {
  it('mostra separadamente as tarefas feitas e por fazer e permite reabrir o grupo', async () => {
    const onOpenTask = vi.fn();
    appMocks.mutate.mockResolvedValue(state.projects[0]);
    render(<HistoryPage state={state} onOpenTask={onOpenTask} />);

    expect(screen.getByRole('heading', { name: 'Grupos concluídos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exame de Física.*1 concluída.*1 por fazer/i })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Exame de Física.*1 concluída.*1 por fazer/i }));
    const taskList = document.getElementById('history-project-exame');
    expect(taskList).not.toBeNull();
    expect(within(taskList!).getByText('Resolver ficha 1')).toBeInTheDocument();
    expect(within(taskList!).getByText('Resolver exercício extra')).toBeInTheDocument();
    expect(within(taskList!).getByText('Por fazer')).toBeInTheDocument();

    fireEvent.click(within(taskList!).getByRole('button', { name: /Resolver exercício extra/i }));
    expect(onOpenTask).toHaveBeenCalledWith('pendente');

    fireEvent.click(screen.getByRole('button', { name: /Reabrir/i }));
    expect(appMocks.mutate).toHaveBeenCalledWith('/api/projects/exame', 'PATCH', { archived: false }, { silent: true });
  });
});
