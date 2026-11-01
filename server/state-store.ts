import { randomUUID } from 'node:crypto';
import type { AppState, Backup, Category, PlannedSession, Project, Settings, Task, TaskDependency } from '../shared/types';
import { assert, AppError } from './errors';
import { categorySchema, projectSchema, sessionSchema, settingsSchema, taskSchema, validationMessage } from './validation';

type Input = Record<string, unknown>;
type ResourceTable = 'categories' | 'projects' | 'tasks' | 'task_dependencies' | 'planned_sessions';

const now = () => new Date().toISOString();
const uuid = () => randomUUID();
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export const defaultSettings: Settings = {
  theme: 'system',
  accent: 'pink',
  preferredCalendarView: 'week',
  weekStartsOn: 1,
  dailyCapacityMinutes: 480
};

export function emptyState(): AppState {
  return {
    categories: [],
    projects: [],
    tasks: [],
    dependencies: [],
    sessions: [],
    settings: { ...defaultSettings }
  };
}

function cloneState(state: AppState): AppState {
  return structuredClone({
    ...emptyState(),
    ...state,
    settings: { ...defaultSettings, ...(state.settings ?? {}) }
  });
}

/**
 * Storage-independent domain layer used by the Netlify Function. The local
 * SQLite server remains available for offline development, while production
 * persists this state as a single transactionally-updated Postgres document.
 */
export class StateStore {
  private readonly state: AppState;

  constructor(state: AppState = emptyState()) {
    this.state = cloneState(state);
    this.archiveFinishedProjects();
  }

  list(): AppState {
    return cloneState(this.state);
  }

  category(input: Input, id?: string): Category {
    const old = id ? this.get(this.state.categories, id, 'Elemento não encontrado.') : undefined;
    const value = this.parse(categorySchema, {
      name: owns(input, 'name') ? input.name : old?.name,
      color: owns(input, 'color') ? input.color : old?.color ?? '#6366f1',
      icon: owns(input, 'icon') ? input.icon : old?.icon ?? null,
      archived: owns(input, 'archived') ? Boolean(input.archived) : Boolean(old?.archived)
    });
    const stamp = now();
    if (old) Object.assign(old, value, { updatedAt: stamp });
    else {
      const created = { id: uuid(), ...value, createdAt: stamp, updatedAt: stamp };
      this.state.categories.push(created);
      id = created.id;
    }
    return { ...this.get(this.state.categories, id!) };
  }

  project(input: Input, id?: string): Project {
    const old = id ? this.get(this.state.projects, id) : undefined;
    const value = this.parse(projectSchema, {
      categoryId: owns(input, 'categoryId') ? input.categoryId : old?.categoryId,
      name: owns(input, 'name') ? input.name : old?.name,
      description: owns(input, 'description') ? input.description : old?.description ?? '',
      color: owns(input, 'color') ? input.color : old?.color ?? null,
      archived: owns(input, 'archived') ? Boolean(input.archived) : Boolean(old?.archived)
    });
    assert(this.exists(this.state.categories, value.categoryId), 'Categoria inválida.');
    const stamp = now();
    if (old) {
      Object.assign(old, value, { updatedAt: stamp });
      this.state.tasks.filter((task) => task.projectId === old.id).forEach((task) => {
        task.categoryId = value.categoryId;
        task.updatedAt = stamp;
      });
      id = old.id;
    } else {
      const created = { id: uuid(), ...value, createdAt: stamp, updatedAt: stamp };
      this.state.projects.push(created);
      id = created.id;
    }
    if (owns(input, 'taskIds')) this.assignProjectTasks(id!, input.taskIds, value.categoryId, stamp);
    return { ...this.get(this.state.projects, id!) };
  }

  task(input: Input, id?: string): Task {
    const old = id ? this.get(this.state.tasks, id) : undefined;
    const previousProjectId = old?.projectId ?? null;
    const previousCategoryId = old?.categoryId ?? null;
    const previousProjectHadTasks = previousProjectId ? this.state.tasks.some((task) => task.projectId === previousProjectId) : false;
    const parentId = (owns(input, 'parentTaskId') ? input.parentTaskId : old?.parentTaskId ?? null) as string | null;
    assert(this.exists(this.state.tasks, parentId), 'Tarefa principal inválida.');
    if (id && parentId) this.assertNoParentCycle(id, parentId);
    const parent = parentId ? this.get(this.state.tasks, parentId) : undefined;
    const projectId = (owns(input, 'projectId') ? input.projectId : old?.projectId ?? parent?.projectId ?? null) as string | null;
    let categoryId = (owns(input, 'categoryId') ? input.categoryId : old?.categoryId ?? parent?.categoryId ?? null) as string | null;
    if (projectId) {
      const project = this.get(this.state.projects, projectId, 'Projeto inválido.');
      if (owns(input, 'categoryId') && categoryId !== project.categoryId) {
        throw new AppError('O projeto selecionado pertence a outra categoria. Escolhe um projeto compatível ou remove-o.');
      }
      categoryId = project.categoryId;
    }
    assert(this.exists(this.state.categories, categoryId), 'Categoria inválida.');
    assert(this.exists(this.state.projects, projectId), 'Projeto inválido.');
    const value = this.parse(taskSchema, {
      title: owns(input, 'title') ? input.title : old?.title,
      description: owns(input, 'description') ? input.description : old?.description ?? '',
      categoryId,
      projectId,
      parentTaskId: parentId,
      status: owns(input, 'status') ? input.status : old?.status ?? 'todo',
      priority: owns(input, 'priority') ? input.priority : old?.priority ?? null,
      deadline: owns(input, 'deadline') ? input.deadline : old?.deadline ?? null,
      estimatedDuration: owns(input, 'estimatedDuration') ? input.estimatedDuration : old?.estimatedDuration ?? null,
      archived: owns(input, 'archived') ? Boolean(input.archived) : Boolean(old?.archived),
      position: owns(input, 'position') ? input.position : old?.position ?? this.nextTaskPosition(parentId, categoryId, projectId)
    });
    let completedAt = old?.completedAt ?? null;
    if (value.status === 'done' && old?.status !== 'done') {
      if (id) {
        const hasOpenChild = this.state.tasks.some((task) => task.parentTaskId === id && task.status !== 'done');
        assert(!hasOpenChild || input.forceComplete === true, 'Existem subtarefas por concluir. Confirma a conclusão forçada.', 409);
      }
      completedAt = now();
    } else if (value.status !== 'done') completedAt = null;
    const stamp = now();
    if (old) Object.assign(old, value, { completedAt, updatedAt: stamp });
    else {
      const created = { id: uuid(), ...value, completedAt, createdAt: stamp, updatedAt: stamp };
      this.state.tasks.push(created);
      id = created.id;
    }
    if (old && (value.projectId !== previousProjectId || value.categoryId !== previousCategoryId)) {
      this.updateTaskFamily(id!, value.projectId, value.categoryId, stamp);
    }
    this.syncProjectLifecycle(previousProjectId, previousProjectHadTasks);
    this.syncProjectLifecycle(value.projectId, true);
    return { ...this.get(this.state.tasks, id!) };
  }

  dependency(input: Input): TaskDependency {
    const taskId = String(input.taskId ?? '');
    const dependsOnTaskId = String(input.dependsOnTaskId ?? '');
    assert(this.exists(this.state.tasks, taskId) && this.exists(this.state.tasks, dependsOnTaskId), 'Tarefa inexistente.');
    assert(taskId !== dependsOnTaskId, 'Uma tarefa não pode depender dela própria.');
    assert(!this.state.dependencies.some((item) => item.taskId === taskId && item.dependsOnTaskId === dependsOnTaskId), 'Dependência já existente.', 409);
    const stack = [dependsOnTaskId];
    const seen = new Set<string>();
    while (stack.length) {
      const current = stack.pop()!;
      assert(current !== taskId, 'Dependência circular detetada.', 409);
      if (seen.has(current)) continue;
      seen.add(current);
      this.state.dependencies.filter((item) => item.taskId === current).forEach((item) => stack.push(item.dependsOnTaskId));
    }
    const dependency = { id: uuid(), taskId, dependsOnTaskId, createdAt: now() };
    this.state.dependencies.push(dependency);
    return { ...dependency };
  }

  session(input: Input, id?: string): PlannedSession {
    const old = id ? this.get(this.state.sessions, id) : undefined;
    const taskId = (owns(input, 'taskId') ? input.taskId : old?.taskId) as string;
    assert(this.exists(this.state.tasks, taskId), 'Tarefa inválida.');
    const value = this.parse(sessionSchema, {
      taskId,
      plannedDate: owns(input, 'plannedDate') ? input.plannedDate : old?.plannedDate,
      plannedDuration: owns(input, 'plannedDuration') ? input.plannedDuration : old?.plannedDuration ?? 0,
      completedDuration: owns(input, 'completedDuration') ? input.completedDuration : old?.completedDuration ?? null,
      status: owns(input, 'status') ? input.status : old?.status ?? 'planned',
      position: owns(input, 'position') ? input.position : old?.position ?? Date.now()
    });
    const stamp = now();
    if (old) Object.assign(old, value, { updatedAt: stamp });
    else {
      const created = { id: uuid(), ...value, createdAt: stamp, updatedAt: stamp };
      this.state.sessions.push(created);
      id = created.id;
    }
    return { ...this.get(this.state.sessions, id!) };
  }

  settings(input: Input): Settings {
    const value = this.parse(settingsSchema, { ...this.state.settings, ...input });
    this.state.settings = value;
    return { ...value };
  }

  reorderTask(id: string, direction: -1 | 1): Task {
    assert(direction === -1 || direction === 1, 'Direção inválida.');
    const task = this.get(this.state.tasks, id);
    const peers = this.state.tasks
      .filter((item) => item.parentTaskId === task.parentTaskId && item.categoryId === task.categoryId && item.projectId === task.projectId && item.archived === task.archived)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
    const from = peers.findIndex((item) => item.id === id);
    const to = from + direction;
    if (to < 0 || to >= peers.length) return { ...task };
    [peers[from], peers[to]] = [peers[to], peers[from]];
    const stamp = now();
    peers.forEach((item, index) => Object.assign(item, { position: index * 1000, updatedAt: stamp }));
    return { ...task };
  }

  duplicateTask(id: string): Task {
    const source = this.get(this.state.tasks, id);
    const root = this.task({ ...source, title: `${source.title} (cópia)`, status: 'todo', archived: false, parentTaskId: source.parentTaskId, position: source.position + 1 });
    const copyChildren = (oldParent: string, newParent: string) => {
      this.state.tasks.filter((task) => task.parentTaskId === oldParent).forEach((child) => {
        const copy = this.task({ ...child, status: 'todo', archived: false, parentTaskId: newParent });
        copyChildren(child.id, copy.id);
      });
    };
    copyChildren(source.id, root.id);
    return root;
  }

  remove(table: ResourceTable, id: string) {
    if (table === 'categories') {
      this.get(this.state.categories, id);
      const projectIds = new Set(this.state.projects.filter((project) => project.categoryId === id).map((project) => project.id));
      this.state.categories = this.state.categories.filter((item) => item.id !== id);
      this.state.projects = this.state.projects.filter((item) => !projectIds.has(item.id));
      this.state.tasks.forEach((task) => {
        if (task.categoryId === id) task.categoryId = null;
        if (task.projectId && projectIds.has(task.projectId)) task.projectId = null;
      });
    } else if (table === 'projects') {
      this.get(this.state.projects, id);
      this.state.projects = this.state.projects.filter((item) => item.id !== id);
      this.state.tasks.filter((task) => task.projectId === id).forEach((task) => { task.projectId = null; });
    } else if (table === 'tasks') {
      const removed = this.get(this.state.tasks, id);
      const previousProjectId = removed.projectId;
      this.state.tasks = this.state.tasks.filter((item) => item.id !== id);
      this.state.tasks.filter((task) => task.parentTaskId === id).forEach((task) => { task.parentTaskId = null; });
      this.state.dependencies = this.state.dependencies.filter((item) => item.taskId !== id && item.dependsOnTaskId !== id);
      this.state.sessions = this.state.sessions.filter((item) => item.taskId !== id);
      this.syncProjectLifecycle(previousProjectId, true);
    } else if (table === 'task_dependencies') {
      this.get(this.state.dependencies, id);
      this.state.dependencies = this.state.dependencies.filter((item) => item.id !== id);
    } else {
      this.get(this.state.sessions, id);
      this.state.sessions = this.state.sessions.filter((item) => item.id !== id);
    }
    return { ok: true };
  }

  export(): Backup {
    return { ...this.list(), format: 'foco-v2', exportedAt: now() };
  }

  import(data: unknown): AppState {
    const imported = this.validateBackup(data);
    Object.assign(this.state, cloneState(imported));
    return this.list();
  }

  private validateBackup(data: unknown): AppState {
    assert(data && typeof data === 'object' && !Array.isArray(data), 'Backup inválido.');
    const raw = data as Partial<Backup>;
    assert(raw.format === 'foco-v2', 'Formato de backup incompatível.');
    for (const key of ['categories', 'projects', 'tasks', 'dependencies', 'sessions'] as const) {
      assert(Array.isArray(raw[key]) && raw[key]!.length <= 100_000, `Lista ${key} inválida.`);
    }
    assert(raw.settings && typeof raw.settings === 'object', 'Definições inválidas.');
    const categories = raw.categories!.map((item) => ({ ...this.parse(categorySchema, item), id: String(item.id), createdAt: String(item.createdAt), updatedAt: String(item.updatedAt) }));
    const projects = raw.projects!.map((item) => ({ ...this.parse(projectSchema, item), id: String(item.id), createdAt: String(item.createdAt), updatedAt: String(item.updatedAt) }));
    const tasks = raw.tasks!.map((item) => ({ ...this.parse(taskSchema, item), id: String(item.id), completedAt: item.completedAt == null ? null : String(item.completedAt), createdAt: String(item.createdAt), updatedAt: String(item.updatedAt) }));
    const dependencies = raw.dependencies!.map((item) => ({ id: String(item.id), taskId: String(item.taskId), dependsOnTaskId: String(item.dependsOnTaskId), createdAt: String(item.createdAt) }));
    const sessions = raw.sessions!.map((item) => ({ ...this.parse(sessionSchema, item), id: String(item.id), createdAt: String(item.createdAt), updatedAt: String(item.updatedAt) }));
    const settings = this.parse(settingsSchema, raw.settings);
    const ids = (items: Array<{ id: string }>, label: string) => {
      assert(items.every((item) => /^[0-9a-f-]{36}$/i.test(item.id)) && new Set(items.map((item) => item.id)).size === items.length, `IDs inválidos em ${label}.`);
      return new Set(items.map((item) => item.id));
    };
    const categoryIds = ids(categories, 'categorias');
    const projectIds = ids(projects, 'projetos');
    const taskIds = ids(tasks, 'tarefas');
    ids(dependencies, 'dependências');
    ids(sessions, 'sessões');
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    projects.forEach((project) => assert(categoryIds.has(project.categoryId), 'Projeto sem categoria válida.'));
    tasks.forEach((task) => {
      assert(!task.categoryId || categoryIds.has(task.categoryId), 'Tarefa com categoria inválida.');
      assert(!task.projectId || projectIds.has(task.projectId), 'Tarefa com projeto inválido.');
      assert(!task.parentTaskId || taskIds.has(task.parentTaskId), 'Subtarefa sem tarefa principal válida.');
      assert(!task.projectId || task.categoryId === projectMap.get(task.projectId)?.categoryId, 'Categoria e projeto incoerentes.');
    });
    sessions.forEach((session) => assert(taskIds.has(session.taskId), 'Sessão com tarefa inválida.'));
    const dependencyMap = new Map<string, string[]>();
    const pairs = new Set<string>();
    dependencies.forEach((dependency) => {
      assert(taskIds.has(dependency.taskId) && taskIds.has(dependency.dependsOnTaskId) && dependency.taskId !== dependency.dependsOnTaskId, 'Dependência inválida.');
      const pair = `${dependency.taskId}/${dependency.dependsOnTaskId}`;
      assert(!pairs.has(pair), 'Dependência duplicada.');
      pairs.add(pair);
      dependencyMap.set(dependency.taskId, [...(dependencyMap.get(dependency.taskId) ?? []), dependency.dependsOnTaskId]);
    });
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    tasks.forEach((task) => {
      const parents = new Set([task.id]);
      let parent = task.parentTaskId;
      while (parent) {
        assert(!parents.has(parent), 'Hierarquia circular de subtarefas.');
        parents.add(parent);
        parent = taskMap.get(parent)?.parentTaskId ?? null;
      }
      const walk = (current: string, path = new Set<string>()) => {
        assert(!path.has(current), 'Dependência circular no backup.');
        const next = new Set(path).add(current);
        (dependencyMap.get(current) ?? []).forEach((dependency) => walk(dependency, next));
      };
      walk(task.id);
    });
    return { categories, projects, tasks, dependencies, sessions, settings };
  }

  private get<T extends { id: string }>(items: T[], id: string, message = 'Elemento não encontrado.'): T {
    const item = items.find((entry) => entry.id === id);
    if (!item) throw new AppError(message, 404);
    return item;
  }

  private exists<T extends { id: string }>(items: T[], id: string | null) {
    return id === null || items.some((item) => item.id === id);
  }

  private parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
    try { return schema.parse(value); }
    catch (error) { throw new AppError(validationMessage(error)); }
  }

  private nextTaskPosition(parentTaskId: string | null, categoryId: string | null, projectId: string | null) {
    const positions = this.state.tasks
      .filter((task) => task.parentTaskId === parentTaskId && task.categoryId === categoryId && task.projectId === projectId)
      .map((task) => task.position);
    return (positions.length ? Math.max(...positions) : -1000) + 1000;
  }

  private assignProjectTasks(projectId: string, rawTaskIds: unknown, categoryId: string, stamp: string) {
    assert(Array.isArray(rawTaskIds), 'Escolhe pelo menos uma tarefa para o grupo.');
    const taskIds = [...new Set(rawTaskIds.map(String))];
    assert(taskIds.length > 0, 'Escolhe pelo menos uma tarefa para o grupo.');
    const selected = taskIds.map((taskId) => this.get(this.state.tasks, taskId, 'Tarefa inválida.'));
    selected.forEach((task) => {
      assert(task.parentTaskId === null, 'Só podes agrupar tarefas principais.');
      assert(task.categoryId === categoryId, 'Todas as tarefas do grupo têm de pertencer à mesma categoria.');
      assert(task.status !== 'done' && !task.archived, 'Só podes agrupar tarefas ativas.');
      assert(task.projectId === null || task.projectId === projectId, 'Uma das tarefas já pertence a outro grupo.');
    });

    const selectedIds = new Set(taskIds);
    const currentRoots = this.state.tasks.filter((task) => task.projectId === projectId && task.parentTaskId === null);
    currentRoots.filter((task) => !selectedIds.has(task.id)).forEach((task) => this.updateTaskFamily(task.id, null, task.categoryId, stamp));
    selected.forEach((task) => this.updateTaskFamily(task.id, projectId, categoryId, stamp));
    const project = this.get(this.state.projects, projectId);
    Object.assign(project, { archived: false, updatedAt: stamp });
  }

  private updateTaskFamily(rootId: string, projectId: string | null, categoryId: string | null, stamp: string) {
    const stack = [rootId];
    const seen = new Set<string>();
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const task = this.get(this.state.tasks, current);
      Object.assign(task, { projectId, categoryId, updatedAt: stamp });
      this.state.tasks.filter((item) => item.parentTaskId === current).forEach((child) => stack.push(child.id));
    }
  }

  private archiveFinishedProjects() {
    const stamp = now();
    this.state.projects.filter((project) => !project.archived).forEach((project) => {
      const related = this.state.tasks.filter((task) => task.projectId === project.id);
      const hasActiveRoot = related.some((task) => task.parentTaskId === null && task.status !== 'done' && !task.archived);
      if (!hasActiveRoot) Object.assign(project, { archived: true, updatedAt: stamp });
    });
  }

  private syncProjectLifecycle(projectId: string | null, previouslyUsed: boolean) {
    if (!projectId) return;
    const project = this.state.projects.find((item) => item.id === projectId);
    if (!project) return;
    const related = this.state.tasks.filter((task) => task.projectId === projectId);
    const hasActiveRoot = related.some((task) => task.parentTaskId === null && task.status !== 'done' && !task.archived);
    if (hasActiveRoot) Object.assign(project, { archived: false, updatedAt: now() });
    else if (related.length || previouslyUsed) Object.assign(project, { archived: true, updatedAt: now() });
  }

  private assertNoParentCycle(taskId: string, parentId: string) {
    assert(taskId !== parentId, 'Uma tarefa não pode ser a sua própria subtarefa.');
    let current: string | null = parentId;
    while (current) {
      assert(current !== taskId, 'Hierarquia circular de subtarefas.');
      current = this.state.tasks.find((task) => task.id === current)?.parentTaskId ?? null;
    }
  }
}
