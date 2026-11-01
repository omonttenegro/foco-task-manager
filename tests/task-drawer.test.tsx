// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../shared/types';
import { useApp } from '../src/context/AppContext';
import { TaskDrawer } from '../src/components/TaskDrawer';

vi.mock('../src/context/AppContext', () => ({ useApp: vi.fn() }));

const timestamp = '2026-10-27T00:00:00.000Z';
const state: AppState = {
  categories: [],
  projects: [],
  tasks: [{
    id: 'tarefa', title: 'Guardar no telemóvel', description: '', categoryId: null, projectId: null,
    parentTaskId: null, status: 'todo', priority: null, deadline: null, estimatedDuration: null,
    completedAt: null, archived: false, position: 0, createdAt: timestamp, updatedAt: timestamp,
  }],
  dependencies: [],
  sessions: [],
  settings: { theme: 'light', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 },
};

describe('guardar tarefa', () => {
  const mutate = vi.fn();
  const notify = vi.fn();

  beforeEach(() => {
    mutate.mockReset().mockResolvedValue(state.tasks[0]);
    notify.mockReset();
    vi.mocked(useApp).mockReturnValue({ state, mutate, notify, busy: false } as never);
  });

  it('fecha imediatamente e bloqueia submissões repetidas', () => {
    const onClose = vi.fn();
    const { container } = render(<TaskDrawer selected="tarefa" onClose={onClose} onSelect={vi.fn()} />);
    const form = container.querySelector<HTMLFormElement>('#task-form');
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
