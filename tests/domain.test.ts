import { describe, expect, it } from 'vitest';
import type { AppState, Task } from '../shared/types';
import { allocatedMinutes, countWorkItems, formatDuration, hasLatePlanning, isBlocked, isDeadlineOverdue, isVisibleInActiveTree, pendingTasks, projectOf, remainingMinutes, sessionsForDay, sortTasks, tasksForCategory, tasksForProject } from '../src/lib/domain';

const timestamp = '2030-01-01T00:00:00.000Z';
const task = (id: string, input: Partial<Task> = {}): Task => ({
  id, title: id, description: '', categoryId: null, projectId: null, parentTaskId: null,
  status: 'todo', priority: null, deadline: null, estimatedDuration: null, completedAt: null,
  archived: false, position: 0, createdAt: timestamp, updatedAt: timestamp, ...input
});
const state = (tasks: Task[]): AppState => ({
  categories: [], projects: [], tasks, dependencies: [], sessions: [],
  settings: { theme: 'system', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 }
});

describe('seletores de domínio', () => {
  it('conta uma árvore como uma unidade de trabalho quando pai e filhos estão visíveis', () => {
    const parent = task('pai');
    const child = task('filho', { parentTaskId: parent.id });
    expect(countWorkItems(state([parent, child]), [parent, child])).toBe(1);
    expect(countWorkItems(state([parent, child]), [child])).toBe(1);
  });

  it('mantém toda a família visível até a tarefa principal desaparecer', () => {
    const root = task('principal');
    const parent = task('filho', { parentTaskId: root.id, status: 'done', completedAt: timestamp });
    const child = task('neto', { parentTaskId: parent.id, status: 'done', completedAt: timestamp });
    const app = state([root, parent, child]);
    expect(isVisibleInActiveTree(app, parent)).toBe(true);
    expect(isVisibleInActiveTree(app, child)).toBe(true);
    root.status = 'done';
    expect(isVisibleInActiveTree(app, root)).toBe(false);
    expect(isVisibleInActiveTree(app, parent)).toBe(false);
    expect(isVisibleInActiveTree(app, child)).toBe(false);
  });

  it('retira a família concluída do trabalho ativo sem alterar os filhos', () => {
    const root = task('principal', { status: 'done', completedAt: timestamp });
    const child = task('filho', { parentTaskId: root.id });
    const app = state([root, child]);
    app.sessions.push({ id: 's', taskId: child.id, plannedDate: '2030-01-02', plannedDuration: 30, completedDuration: null, status: 'planned', position: 0, createdAt: timestamp, updatedAt: timestamp });

    expect(child.status).toBe('todo');
    expect(pendingTasks(app)).toEqual([]);
    expect(sessionsForDay(app, '2030-01-02')).toEqual([]);
  });

  it('não volta a mostrar uma subtarefa arquivada através das sessões', () => {
    const root = task('principal');
    const child = task('filho', { parentTaskId: root.id, archived: true });
    const app = state([root, child]);
    app.sessions.push({ id: 's', taskId: child.id, plannedDate: '2030-01-02', plannedDuration: 30, completedDuration: null, status: 'planned', position: 0, createdAt: timestamp, updatedAt: timestamp });

    expect(isVisibleInActiveTree(app, child)).toBe(false);
    expect(sessionsForDay(app, '2030-01-02')).toEqual([]);
  });

  it('retira do trabalho ativo as tarefas de um grupo arquivado', () => {
    const grouped = task('agrupada', { categoryId: 'cat', projectId: 'grupo' });
    const app = state([grouped]);
    app.categories.push({ id: 'cat', name: 'Faculdade', color: '#ef2b87', icon: null, archived: false, createdAt: timestamp, updatedAt: timestamp });
    app.projects.push({ id: 'grupo', categoryId: 'cat', name: 'Investimentos', description: '', color: null, archived: true, createdAt: timestamp, updatedAt: timestamp });

    expect(isVisibleInActiveTree(app, grouped)).toBe(false);
    expect(pendingTasks(app)).toEqual([]);
  });

  it('herda o contexto do grupo da tarefa principal', () => {
    const root = task('principal', { categoryId: 'cat', projectId: 'grupo' });
    const child = task('filho', { categoryId: 'cat', parentTaskId: root.id });
    const app = state([root, child]);
    app.projects.push({ id: 'grupo', categoryId: 'cat', name: 'Investimentos', description: '', color: null, archived: false, createdAt: timestamp, updatedAt: timestamp });

    expect(projectOf(app, child)?.name).toBe('Investimentos');
  });

  it('calcula bloqueios pelas dependências ainda abertas', () => {
    const blocker = task('origem');
    const blocked = task('destino');
    const app = state([blocker, blocked]);
    app.dependencies.push({ id: 'dep', taskId: blocked.id, dependsOnTaskId: blocker.id, createdAt: timestamp });
    expect(isBlocked(app, blocked)).toBe(true);
    blocker.status = 'done';
    expect(isBlocked(app, blocked)).toBe(false);
  });

  it('calcula alocação, restante e formatos de duração', () => {
    const item = task('t', { estimatedDuration: 150 });
    const app = state([item]);
    app.sessions.push({ id: 's', taskId: item.id, plannedDate: '2030-01-02', plannedDuration: 65, completedDuration: null, status: 'planned', position: 0, createdAt: timestamp, updatedAt: timestamp });
    expect(allocatedMinutes(app, item.id)).toBe(65);
    expect(remainingMinutes(app, item)).toBe(85);
    expect(formatDuration(125)).toBe('2 h 5 min');
  });

  it('ordena prioridade sem promover tarefas sem prioridade', () => {
    const tasks = [task('sem'), task('p2', { priority: 2 }), task('p1', { priority: 1 })];
    expect(sortTasks(tasks, 'priority').map((item) => item.id)).toEqual(['p1', 'p2', 'sem']);
  });

  it('distingue deadline ultrapassado de planeamento ultrapassado', () => {
    const deadlineLate = task('deadline', { deadline: '2030-01-01' });
    const planningLate = task('planeamento', { deadline: '2030-01-20' });
    const app = state([deadlineLate, planningLate]);
    app.sessions.push({ id: 's', taskId: planningLate.id, plannedDate: '2030-01-02', plannedDuration: 30, completedDuration: null, status: 'planned', position: 0, createdAt: timestamp, updatedAt: timestamp });
    expect(isDeadlineOverdue(deadlineLate, '2030-01-10')).toBe(true);
    expect(isDeadlineOverdue(planningLate, '2030-01-10')).toBe(false);
    expect(hasLatePlanning(app, planningLate, '2030-01-10')).toBe(true);
  });

  it('agrega tarefas de uma categoria e de um projeto', () => {
    const categoryTask = task('categoria', { categoryId: 'cat' });
    const projectTask = task('projeto', { categoryId: 'cat', projectId: 'project' });
    const elsewhere = task('outra', { categoryId: 'other' });
    const app = state([categoryTask, projectTask, elsewhere]);
    expect(tasksForCategory(app, 'cat').map((item) => item.id)).toEqual(['categoria', 'projeto']);
    expect(tasksForProject(app, 'project').map((item) => item.id)).toEqual(['projeto']);
  });
});
