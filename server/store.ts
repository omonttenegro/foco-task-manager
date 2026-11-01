import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { AppState, Backup, Category, PlannedSession, Project, Settings, Task, TaskDependency } from '../shared/types';
import { assert, AppError } from './errors';
import { categorySchema, projectSchema, sessionSchema, settingsSchema, taskSchema, validationMessage } from './validation';

type Input = Record<string, unknown>;
type Stored<T extends { archived: boolean }> = Omit<T, 'archived'> & { archived: number };
const now = () => new Date().toISOString();
const uuid = () => randomUUID();
const owns = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const defaults: Settings = { theme: 'system', accent: 'pink', preferredCalendarView: 'week', weekStartsOn: 1, dailyCapacityMinutes: 480 };

export class Store {
  constructor(public readonly db: DatabaseSync) {
    for (const [key, value] of Object.entries(defaults)) {
      this.db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(key, JSON.stringify(value));
    }
    this.archiveFinishedProjects();
  }

  private all<T>(sql: string, ...args: SQLInputValue[]) { return this.db.prepare(sql).all(...args) as T[]; }
  private one<T>(sql: string, ...args: SQLInputValue[]) { return this.db.prepare(sql).get(...args) as T | undefined; }
  private get<T>(table: string, id: string): T {
    const row = this.one<T>(`SELECT * FROM ${table} WHERE id=?`, id);
    if (!row) throw new AppError('Elemento não encontrado.', 404);
    return row;
  }
  private exists(table: string, id: string | null) {
    return id === null || Boolean(this.one(`SELECT id FROM ${table} WHERE id=?`, id));
  }
  private bool<T extends { archived: number | boolean }>(rows: T[]) {
    return rows.map((row) => ({ ...row, archived: Boolean(row.archived) }));
  }
  private parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
    try { return schema.parse(value); } catch (error) { throw new AppError(validationMessage(error)); }
  }

  list(): AppState {
    const categories = this.bool(this.all<Stored<Category>>('SELECT * FROM categories ORDER BY createdAt')) as Category[];
    const projects = this.bool(this.all<Stored<Project>>('SELECT * FROM projects ORDER BY createdAt')) as Project[];
    const tasks = this.bool(this.all<Stored<Task>>('SELECT * FROM tasks ORDER BY position,createdAt,rowid')) as Task[];
    const dependencies = this.all<TaskDependency>('SELECT * FROM task_dependencies ORDER BY createdAt');
    const sessions = this.all<PlannedSession>('SELECT * FROM planned_sessions ORDER BY plannedDate,position,createdAt');
    const settings = Object.fromEntries(
      this.all<{ key: string; value: string }>('SELECT * FROM settings').map((row) => [row.key, JSON.parse(row.value)])
    ) as unknown as Settings;
    return { categories, projects, tasks, dependencies, sessions, settings };
  }

  category(input: Input, id?: string): Category {
    const old = id ? this.get<Stored<Category>>('categories', id) : undefined;
    const value = this.parse(categorySchema, {
      name: owns(input, 'name') ? input.name : old?.name,
      color: owns(input, 'color') ? input.color : old?.color ?? '#6366f1',
      icon: owns(input, 'icon') ? input.icon : old?.icon ?? null,
      archived: owns(input, 'archived') ? Boolean(input.archived) : Boolean(old?.archived)
    });
    const stamp = now();
    if (id) {
      this.db.prepare('UPDATE categories SET name=?,color=?,icon=?,archived=?,updatedAt=? WHERE id=?')
        .run(value.name, value.color, value.icon, Number(value.archived), stamp, id);
    } else {
      id = uuid();
      this.db.prepare('INSERT INTO categories VALUES(?,?,?,?,?,?,?)')
        .run(id, value.name, value.color, value.icon, Number(value.archived), stamp, stamp);
    }
    return { ...this.get<Stored<Category>>('categories', id!), archived: value.archived };
  }

  project(input: Input, id?: string): Project {
    const old = id ? this.get<Stored<Project>>('projects', id) : undefined;
    const value = this.parse(projectSchema, {
      categoryId: owns(input, 'categoryId') ? input.categoryId : old?.categoryId,
      name: owns(input, 'name') ? input.name : old?.name,
      description: owns(input, 'description') ? input.description : old?.description ?? '',
      color: owns(input, 'color') ? input.color : old?.color ?? null,
      archived: owns(input, 'archived') ? Boolean(input.archived) : Boolean(old?.archived)
    });
    assert(this.exists('categories', value.categoryId), 'Categoria inválida.');
    const stamp = now();
    this.transaction(() => {
      if (id) {
        this.db.prepare('UPDATE projects SET categoryId=?,name=?,description=?,color=?,archived=?,updatedAt=? WHERE id=?')
          .run(value.categoryId, value.name, value.description, value.color, Number(value.archived), stamp, id!);
        this.db.prepare('UPDATE tasks SET categoryId=?,updatedAt=? WHERE projectId=?').run(value.categoryId, stamp, id!);
      } else {
        id = uuid();
        this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)')
          .run(id, value.categoryId, value.name, value.description, value.color, Number(value.archived), stamp, stamp);
      }
      if (owns(input, 'taskIds')) this.assignProjectTasks(id!, input.taskIds, value.categoryId, stamp);
    });
    const stored = this.get<Stored<Project>>('projects', id!);
    return { ...stored, archived: Boolean(stored.archived) };
  }

  task(input: Input, id?: string): Task {
    const old = id ? this.get<Stored<Task>>('tasks', id) : undefined;
    const previousProjectId = old?.projectId ?? null;
    const previousProjectHadTasks = previousProjectId
      ? Boolean(this.one('SELECT id FROM tasks WHERE projectId=? LIMIT 1', previousProjectId))
      : false;
    const parentId = (owns(input, 'parentTaskId') ? input.parentTaskId : old?.parentTaskId ?? null) as string | null;
    assert(this.exists('tasks', parentId), 'Tarefa principal inválida.');
    if (id && parentId) this.assertNoParentCycle(id, parentId);
    const parent = parentId ? this.get<Task>('tasks', parentId) : undefined;
    let projectId = (owns(input, 'projectId') ? input.projectId : old?.projectId ?? parent?.projectId ?? null) as string | null;
    let categoryId = (owns(input, 'categoryId') ? input.categoryId : old?.categoryId ?? parent?.categoryId ?? null) as string | null;
    if (projectId) {
      const project = this.get<Project>('projects', projectId);
      if (owns(input, 'categoryId') && categoryId !== project.categoryId) {
        throw new AppError('O projeto selecionado pertence a outra categoria. Escolhe um projeto compatível ou remove-o.');
      }
      categoryId = project.categoryId;
    }
    assert(this.exists('categories', categoryId), 'Categoria inválida.');
    assert(this.exists('projects', projectId), 'Projeto inválido.');
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
        const openChild = this.one('SELECT id FROM tasks WHERE parentTaskId=? AND status<>\'done\' LIMIT 1', id);
        assert(!openChild || input.forceComplete === true, 'Existem subtarefas por concluir. Confirma a conclusão forçada.', 409);
      }
      completedAt = now();
    } else if (value.status !== 'done') completedAt = null;
    const stamp = now();
    if (id) {
      this.db.prepare(`UPDATE tasks SET title=?,description=?,categoryId=?,projectId=?,parentTaskId=?,status=?,priority=?,deadline=?,estimatedDuration=?,completedAt=?,archived=?,position=?,updatedAt=? WHERE id=?`)
        .run(value.title, value.description, value.categoryId, value.projectId, value.parentTaskId, value.status, value.priority, value.deadline, value.estimatedDuration, completedAt, Number(value.archived), value.position, stamp, id);
    } else {
      id = uuid();
      this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, value.title, value.description, value.categoryId, value.projectId, value.parentTaskId, value.status, value.priority, value.deadline, value.estimatedDuration, completedAt, Number(value.archived), value.position, stamp, stamp);
    }
    if (old && (old.projectId !== value.projectId || old.categoryId !== value.categoryId)) {
      this.updateTaskFamily(id!, value.projectId, value.categoryId, stamp);
    }
    this.syncProjectLifecycle(previousProjectId, previousProjectHadTasks);
    this.syncProjectLifecycle(value.projectId, true);
    return { ...this.get<Stored<Task>>('tasks', id!), archived: value.archived };
  }

  dependency(input: Input): TaskDependency {
    const taskId = String(input.taskId ?? '');
    const dependsOnTaskId = String(input.dependsOnTaskId ?? '');
    assert(this.exists('tasks', taskId) && this.exists('tasks', dependsOnTaskId), 'Tarefa inexistente.');
    assert(taskId !== dependsOnTaskId, 'Uma tarefa não pode depender dela própria.');
    assert(!this.one('SELECT id FROM task_dependencies WHERE taskId=? AND dependsOnTaskId=?', taskId, dependsOnTaskId), 'Dependência já existente.', 409);
    const stack = [dependsOnTaskId];
    const seen = new Set<string>();
    while (stack.length) {
      const current = stack.pop()!;
      assert(current !== taskId, 'Dependência circular detetada.', 409);
      if (seen.has(current)) continue;
      seen.add(current);
      this.all<{ dependsOnTaskId: string }>('SELECT dependsOnTaskId FROM task_dependencies WHERE taskId=?', current)
        .forEach((row) => stack.push(row.dependsOnTaskId));
    }
    const id = uuid();
    this.db.prepare('INSERT INTO task_dependencies VALUES(?,?,?,?)').run(id, taskId, dependsOnTaskId, now());
    return this.get<TaskDependency>('task_dependencies', id);
  }

  session(input: Input, id?: string): PlannedSession {
    const old = id ? this.get<PlannedSession>('planned_sessions', id) : undefined;
    const taskId = (owns(input, 'taskId') ? input.taskId : old?.taskId) as string;
    assert(this.exists('tasks', taskId), 'Tarefa inválida.');
    const value = this.parse(sessionSchema, {
      taskId,
      plannedDate: owns(input, 'plannedDate') ? input.plannedDate : old?.plannedDate,
      plannedDuration: owns(input, 'plannedDuration') ? input.plannedDuration : old?.plannedDuration ?? 0,
      completedDuration: owns(input, 'completedDuration') ? input.completedDuration : old?.completedDuration ?? null,
      status: owns(input, 'status') ? input.status : old?.status ?? 'planned',
      position: owns(input, 'position') ? input.position : old?.position ?? Date.now()
    });
    const stamp = now();
    if (id) {
      this.db.prepare('UPDATE planned_sessions SET taskId=?,plannedDate=?,plannedDuration=?,completedDuration=?,status=?,position=?,updatedAt=? WHERE id=?')
        .run(value.taskId, value.plannedDate, value.plannedDuration, value.completedDuration, value.status, value.position, stamp, id);
    } else {
      id = uuid();
      this.db.prepare('INSERT INTO planned_sessions VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, value.taskId, value.plannedDate, value.plannedDuration, value.completedDuration, value.status, value.position, stamp, stamp);
    }
    return this.get<PlannedSession>('planned_sessions', id);
  }

  settings(input: Input): Settings {
    const merged = { ...this.list().settings, ...input };
    const value = this.parse(settingsSchema, merged);
    this.transaction(() => {
      for (const [key, setting] of Object.entries(value)) {
        this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
          .run(key, JSON.stringify(setting));
      }
    });
    return value;
  }

  reorderTask(id: string, direction: -1 | 1): Task {
    assert(direction === -1 || direction === 1, 'Direção inválida.');
    const task = this.get<Task>('tasks', id);
    const peers = this.all<{ id: string }>(
      'SELECT id FROM tasks WHERE parentTaskId IS ? AND categoryId IS ? AND projectId IS ? AND archived=? ORDER BY position,createdAt,rowid',
      task.parentTaskId, task.categoryId, task.projectId, Number(task.archived)
    ).map((row) => row.id);
    const from = peers.indexOf(id);
    const to = from + direction;
    if (to < 0 || to >= peers.length) return task;
    [peers[from], peers[to]] = [peers[to], peers[from]];
    this.transaction(() => peers.forEach((taskId, index) => {
      this.db.prepare('UPDATE tasks SET position=?,updatedAt=? WHERE id=?').run(index * 1000, now(), taskId);
    }));
    return this.get<Task>('tasks', id);
  }

  duplicateTask(id: string): Task {
    const source = this.get<Task>('tasks', id);
    let root!: Task;
    this.transaction(() => {
      root = this.task({ ...source, title: `${source.title} (cópia)`, status: 'todo', archived: false, parentTaskId: source.parentTaskId, position: source.position + 1 });
      const copyChildren = (oldParent: string, newParent: string) => {
        for (const child of this.all<Task>('SELECT * FROM tasks WHERE parentTaskId=? ORDER BY position', oldParent)) {
          const copy = this.task({ ...child, status: 'todo', archived: false, parentTaskId: newParent });
          copyChildren(child.id, copy.id);
        }
      };
      copyChildren(source.id, root.id);
    });
    return root;
  }

  remove(table: 'categories' | 'projects' | 'tasks' | 'task_dependencies' | 'planned_sessions', id: string) {
    const removedTask = table === 'tasks' ? this.get<Task>('tasks', id) : null;
    this.get(table, id);
    this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
    if (removedTask?.projectId) this.syncProjectLifecycle(removedTask.projectId, true);
    return { ok: true };
  }

  export(): Backup { return { ...this.list(), format: 'foco-v2', exportedAt: now() }; }

  import(data: unknown): AppState {
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
    const dependencies = raw.dependencies!;
    const sessions = raw.sessions!.map((item) => ({ ...this.parse(sessionSchema, item), id: String(item.id), createdAt: String(item.createdAt), updatedAt: String(item.updatedAt) }));
    const settings = this.parse(settingsSchema, raw.settings);
    const ids = (items: Array<{ id: string }>, label: string) => {
      assert(items.every((item) => /^[0-9a-f-]{36}$/i.test(item.id)) && new Set(items.map((item) => item.id)).size === items.length, `IDs inválidos em ${label}.`);
      return new Set(items.map((item) => item.id));
    };
    const categoryIds = ids(categories, 'categorias');
    const projectIds = ids(projects, 'projetos');
    const taskIds = ids(tasks, 'tarefas');
    ids(dependencies as Array<{ id: string }>, 'dependências');
    ids(sessions, 'sessões');
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    projects.forEach((project) => assert(categoryIds.has(project.categoryId), 'Projeto sem categoria válida.'));
    tasks.forEach((task) => {
      assert(!task.categoryId || categoryIds.has(task.categoryId), 'Tarefa com categoria inválida.');
      assert(!task.projectId || projectIds.has(task.projectId), 'Tarefa com projeto inválido.');
      assert(!task.parentTaskId || taskIds.has(task.parentTaskId), 'Subtarefa sem tarefa principal válida.');
      assert(!task.projectId || task.categoryId === projectMap.get(task.projectId)?.categoryId, 'Categoria e projeto incoerentes.');
    });
    sessions.forEach((session) => assert(taskIds.has(session.taskId), 'Sessão sem tarefa válida.'));
    const depPairs = new Set<string>();
    const depMap = new Map<string, string[]>();
    dependencies.forEach((dependency) => {
      assert(taskIds.has(dependency.taskId) && taskIds.has(dependency.dependsOnTaskId) && dependency.taskId !== dependency.dependsOnTaskId, 'Dependência inválida.');
      const key = `${dependency.taskId}/${dependency.dependsOnTaskId}`;
      assert(!depPairs.has(key), 'Dependência duplicada.');
      depPairs.add(key);
      depMap.set(dependency.taskId, [...(depMap.get(dependency.taskId) ?? []), dependency.dependsOnTaskId]);
    });
    const taskMap = new Map(tasks.map((task) => [task.id, task]));
    tasks.forEach((task) => {
      const parents = new Set([task.id]);
      let parent = task.parentTaskId;
      while (parent) { assert(!parents.has(parent), 'Hierarquia circular de subtarefas.'); parents.add(parent); parent = taskMap.get(parent)?.parentTaskId ?? null; }
      const walk = (current: string, path = new Set<string>()) => {
        assert(!path.has(current), 'Dependência circular no backup.');
        const next = new Set(path).add(current);
        (depMap.get(current) ?? []).forEach((dependency) => walk(dependency, next));
      };
      walk(task.id);
    });
    this.transaction(() => {
      for (const table of ['planned_sessions', 'task_dependencies', 'tasks', 'projects', 'categories', 'settings']) this.db.exec(`DELETE FROM ${table}`);
      categories.forEach((item) => this.db.prepare('INSERT INTO categories VALUES(?,?,?,?,?,?,?)').run(item.id, item.name, item.color, item.icon, Number(item.archived), item.createdAt, item.updatedAt));
      projects.forEach((item) => this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)').run(item.id, item.categoryId, item.name, item.description, item.color, Number(item.archived), item.createdAt, item.updatedAt));
      tasks.forEach((item) => this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id, item.title, item.description, item.categoryId, item.projectId, null, item.status, item.priority, item.deadline, item.estimatedDuration, item.completedAt, Number(item.archived), item.position, item.createdAt, item.updatedAt));
      tasks.filter((item) => item.parentTaskId).forEach((item) => this.db.prepare('UPDATE tasks SET parentTaskId=? WHERE id=?').run(item.parentTaskId, item.id));
      dependencies.forEach((item) => this.db.prepare('INSERT INTO task_dependencies VALUES(?,?,?,?)').run(item.id, item.taskId, item.dependsOnTaskId, item.createdAt));
      sessions.forEach((item) => this.db.prepare('INSERT INTO planned_sessions VALUES(?,?,?,?,?,?,?,?,?)').run(item.id, item.taskId, item.plannedDate, item.plannedDuration, item.completedDuration, item.status, item.position, item.createdAt, item.updatedAt));
      Object.entries(settings).forEach(([key, value]) => this.db.prepare('INSERT INTO settings VALUES(?,?)').run(key, JSON.stringify(value)));
    });
    return this.list();
  }

  close() { this.db.close(); }

  private nextTaskPosition(parentTaskId: string | null, categoryId: string | null, projectId: string | null) {
    const row = this.one<{ value: number }>('SELECT COALESCE(MAX(position),-1000)+1000 AS value FROM tasks WHERE parentTaskId IS ? AND categoryId IS ? AND projectId IS ?', parentTaskId, categoryId, projectId);
    return row?.value ?? 0;
  }

  private assignProjectTasks(projectId: string, rawTaskIds: unknown, categoryId: string, stamp: string) {
    assert(Array.isArray(rawTaskIds), 'Escolhe pelo menos uma tarefa para o grupo.');
    const taskIds = [...new Set(rawTaskIds.map(String))];
    assert(taskIds.length > 0, 'Escolhe pelo menos uma tarefa para o grupo.');
    const selected = taskIds.map((taskId) => this.get<Task>('tasks', taskId));
    selected.forEach((task) => {
      assert(task.parentTaskId === null, 'Só podes agrupar tarefas principais.');
      assert(task.categoryId === categoryId, 'Todas as tarefas do grupo têm de pertencer à mesma categoria.');
      assert(task.status !== 'done' && !Boolean(task.archived), 'Só podes agrupar tarefas ativas.');
      assert(task.projectId === null || task.projectId === projectId, 'Uma das tarefas já pertence a outro grupo.');
    });

    const selectedIds = new Set(taskIds);
    this.all<{ id: string; categoryId: string | null }>('SELECT id,categoryId FROM tasks WHERE projectId=? AND parentTaskId IS NULL', projectId)
      .filter((task) => !selectedIds.has(task.id))
      .forEach((task) => this.updateTaskFamily(task.id, null, task.categoryId, stamp));
    selected.forEach((task) => this.updateTaskFamily(task.id, projectId, categoryId, stamp));
    this.db.prepare('UPDATE projects SET archived=0,updatedAt=? WHERE id=?').run(stamp, projectId);
  }

  private updateTaskFamily(rootId: string, projectId: string | null, categoryId: string | null, stamp: string) {
    if (projectId) {
      this.db.prepare(`WITH RECURSIVE family(id) AS (
        SELECT id FROM tasks WHERE id=?
        UNION ALL
        SELECT tasks.id FROM tasks JOIN family ON tasks.parentTaskId=family.id
      ) UPDATE tasks SET projectId=?,categoryId=?,updatedAt=? WHERE id IN (SELECT id FROM family)`)
        .run(rootId, projectId, categoryId, stamp);
      return;
    }
    this.db.prepare(`WITH RECURSIVE family(id) AS (
      SELECT id FROM tasks WHERE id=?
      UNION ALL
      SELECT tasks.id FROM tasks JOIN family ON tasks.parentTaskId=family.id
    ) UPDATE tasks SET projectId=NULL,categoryId=?,updatedAt=? WHERE id IN (SELECT id FROM family)`)
      .run(rootId, categoryId, stamp);
  }

  private archiveFinishedProjects() {
    const stamp = now();
    this.db.prepare(`UPDATE projects SET archived=1,updatedAt=?
      WHERE archived=0
        AND NOT EXISTS(
          SELECT 1 FROM tasks
          WHERE tasks.projectId=projects.id
            AND tasks.parentTaskId IS NULL
            AND tasks.status<>'done'
            AND tasks.archived=0
        )`).run(stamp);
  }

  private syncProjectLifecycle(projectId: string | null, previouslyUsed: boolean) {
    if (!projectId || !this.exists('projects', projectId)) return;
    const hasTasks = Boolean(this.one('SELECT id FROM tasks WHERE projectId=? LIMIT 1', projectId));
    const hasActiveRoot = Boolean(this.one(`SELECT id FROM tasks
      WHERE projectId=? AND parentTaskId IS NULL AND status<>'done' AND archived=0 LIMIT 1`, projectId));
    if (hasActiveRoot) this.db.prepare('UPDATE projects SET archived=0,updatedAt=? WHERE id=?').run(now(), projectId);
    else if (hasTasks || previouslyUsed) this.db.prepare('UPDATE projects SET archived=1,updatedAt=? WHERE id=?').run(now(), projectId);
  }
  private assertNoParentCycle(taskId: string, parentId: string) {
    assert(taskId !== parentId, 'Uma tarefa não pode ser a sua própria subtarefa.');
    let current: string | null = parentId;
    while (current) {
      assert(current !== taskId, 'Hierarquia circular de subtarefas.');
      current = this.one<{ parentTaskId: string | null }>('SELECT parentTaskId FROM tasks WHERE id=?', current)?.parentTaskId ?? null;
    }
  }
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
