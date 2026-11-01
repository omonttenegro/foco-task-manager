// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/types';
import { TaskListPage } from '../src/pages/TaskListPage';

vi.mock('../src/context/AppContext', () => ({
  useApp: () => ({ mutate: vi.fn() }),
}));

const timestamp = '2026-10-26T00:00:00.000Z';
const state: AppState = {
  categories: [{ id: 'ijc', name: 'IJC', color: '#20b58b', icon: null, archived: false, createdAt: timestamp, updatedAt: timestamp }],
  projects: [],
  tasks: [{
    id: 'tarefa', title: 'Preparar apresentação', description: '', categoryId: 'ijc', projectId: null,
    parentTaskId: null, status: 'todo', priority: null, deadline: null, estimatedDuration: null,
    completedAt: null, archived: false, position: 0, createdAt: timestamp, updatedAt: timestamp,
  }],
  dependencies: [],
  sessions: [],
  settings: { theme: 'light', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 },
};

describe('grupos de categorias', () => {
  it('abre e fecha uma categoria ao clicar no respetivo título', () => {
    const { container } = render(<TaskListPage state={state} view={{ key: 'inbox' }} search="" onOpenTask={vi.fn()} onModal={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /IJC.*1 tarefa/i });
    const items = document.getElementById(toggle.getAttribute('aria-controls')!);
    const taskMeta = container.querySelector('[data-task-id="tarefa"] .task-meta');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(items).toHaveAttribute('aria-hidden', 'false');
    expect(taskMeta).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(items).toHaveAttribute('aria-hidden', 'true');
    expect(toggle.closest('.task-category-group')).toHaveClass('is-collapsed');
  });

  it('usa apenas o título principal e deixa as concluídas para o histórico', () => {
    const withCompleted: AppState = {
      ...state,
      tasks: [
        ...state.tasks,
        { ...state.tasks[0], id: 'concluida', title: 'Tarefa concluída', status: 'done', completedAt: timestamp },
      ],
    };
    const { container } = render(<TaskListPage state={withCompleted} view={{ key: 'inbox' }} search="" onOpenTask={vi.fn()} onModal={vi.fn()} />);
    const page = within(container);

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')).toHaveTextContent('Tarefas');
    expect(page.getByRole('button', { name: /Filtrar/i })).toBeInTheDocument();
    expect(page.queryByText('Pendentes')).not.toBeInTheDocument();
    expect(page.queryByText('Concluídas')).not.toBeInTheDocument();
    expect(page.queryByText('Todas')).not.toBeInTheDocument();
    expect(page.queryByText('Tarefa concluída')).not.toBeInTheDocument();
  });
});
