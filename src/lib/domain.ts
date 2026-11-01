import type { AppState, PlannedSession, Task } from '../../shared/types';

export const categoryOf = (state: AppState, task: Task) => state.categories.find((item) => item.id === task.categoryId) ?? null;
export const projectOf = (state: AppState, task: Task) => {
  let current: Task | undefined = task;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.projectId) return state.projects.find((item) => item.id === current!.projectId) ?? null;
    current = current.parentTaskId ? state.tasks.find((item) => item.id === current!.parentTaskId) : undefined;
  }
  return null;
};
export const childrenOf = (state: AppState, taskId: string) => state.tasks.filter((task) => task.parentTaskId === taskId);
export const dependenciesOf = (state: AppState, taskId: string) => state.dependencies.filter((dependency) => dependency.taskId === taskId);
export const dependantsOf = (state: AppState, taskId: string) => state.dependencies.filter((dependency) => dependency.dependsOnTaskId === taskId);
export const blockersOf = (state: AppState, taskId: string) => dependenciesOf(state, taskId)
  .map((dependency) => state.tasks.find((task) => task.id === dependency.dependsOnTaskId))
  .filter((task): task is Task => Boolean(task && task.status !== 'done'));
export const isBlocked = (state: AppState, task: Task) => blockersOf(state, task.id).length > 0;
export const isHidden = (state: AppState, task: Task) => task.archived
  || Boolean(task.categoryId && state.categories.find((item) => item.id === task.categoryId)?.archived)
  || Boolean(task.projectId && state.projects.find((item) => item.id === task.projectId)?.archived);
export const activeTasks = (state: AppState) => state.tasks.filter((task) => !isHidden(state, task));
export const tasksForCategory = (state: AppState, categoryId: string) => activeTasks(state).filter((task) => task.categoryId === categoryId);
export const tasksForProject = (state: AppState, projectId: string) => activeTasks(state).filter((task) => task.projectId === projectId);
export function isVisibleInActiveTree(state: AppState, task: Task) {
  if (isHidden(state, task)) return false;
  let root = task;
  let parentId: string | null = task.parentTaskId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = state.tasks.find((item) => item.id === parentId);
    if (!parent) break;
    if (isHidden(state, parent)) return false;
    root = parent;
    parentId = parent.parentTaskId;
  }
  return root.status !== 'done';
}
// A child keeps its own status when the main task is completed, but the whole
// family leaves every active workflow together. History can still show each
// member and its real, unchanged status.
export const pendingTasks = (state: AppState) => activeTasks(state)
  .filter((task) => task.status !== 'done' && isVisibleInActiveTree(state, task));
export const isDeadlineOverdue = (task: Task, day: string) => task.status !== 'done' && Boolean(task.deadline && task.deadline < day);
export const hasLatePlanning = (state: AppState, task: Task, day: string) => task.status !== 'done' && state.sessions.some((session) => session.taskId === task.id && session.plannedDate < day && session.status !== 'done');
export const sessionsOf = (state: AppState, taskId: string) => state.sessions.filter((session) => session.taskId === taskId);
export const allocatedMinutes = (state: AppState, taskId: string) => sessionsOf(state, taskId).reduce((sum, session) => sum + session.plannedDuration, 0);
export const remainingMinutes = (state: AppState, task: Task) => task.estimatedDuration == null ? null : Math.max(0, task.estimatedDuration - allocatedMinutes(state, task.id));
export const sessionsForDay = (state: AppState, day: string) => state.sessions.filter((session) => {
  if (session.plannedDate !== day) return false;
  const task = state.tasks.find((item) => item.id === session.taskId);
  return Boolean(task && isVisibleInActiveTree(state, task));
});
export const uniqueTasksForSessions = (state: AppState, sessions: PlannedSession[]) => [...new Set(sessions.map((session) => session.taskId))]
  .map((id) => state.tasks.find((task) => task.id === id)).filter((task): task is Task => Boolean(task));

export function formatDuration(minutes: number | null | undefined) {
  if (minutes == null) return 'Sem estimativa';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h${rest ? ` ${rest} min` : ''}`;
}

export function taskProgress(state: AppState, task: Task) {
  const children = childrenOf(state, task.id);
  const done = children.filter((child) => child.status === 'done').length;
  return { total: children.length, done, percent: children.length ? Math.round(done / children.length * 100) : task.status === 'done' ? 100 : 0 };
}

export type SortMode = 'manual' | 'priority' | 'deadline' | 'duration' | 'title';
export function sortTasks(tasks: Task[], mode: SortMode) {
  const result = [...tasks];
  const infinity = Number.POSITIVE_INFINITY;
  result.sort((a, b) => {
    if (mode === 'priority') return (a.priority ?? infinity) - (b.priority ?? infinity) || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999');
    if (mode === 'deadline') return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || (a.priority ?? infinity) - (b.priority ?? infinity);
    if (mode === 'duration') return (a.estimatedDuration ?? infinity) - (b.estimatedDuration ?? infinity);
    if (mode === 'title') return a.title.localeCompare(b.title, 'pt');
    return a.position - b.position || a.createdAt.localeCompare(b.createdAt);
  });
  return result;
}

export function countWorkItems(state: AppState, tasks: Task[]) {
  const ids = new Set(tasks.map((task) => task.id));
  return tasks.filter((task) => task.status !== 'done' && !(task.parentTaskId && ids.has(task.parentTaskId))).length;
}
