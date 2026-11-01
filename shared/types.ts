export type TaskStatus = 'todo' | 'progress' | 'done';
export type Priority = 1 | 2 | 3 | 4;
export type SessionStatus = 'planned' | 'done';
export type Theme = 'light' | 'dark' | 'system';
export type AppAccent = 'pink' | 'blue' | 'violet' | 'emerald';
export type CalendarView = 'month' | 'week' | 'day';

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  color: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  categoryId: string | null;
  projectId: string | null;
  parentTaskId: string | null;
  status: TaskStatus;
  priority: Priority | null;
  deadline: string | null;
  estimatedDuration: number | null;
  completedAt: string | null;
  archived: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export interface PlannedSession {
  id: string;
  taskId: string;
  plannedDate: string;
  plannedDuration: number;
  completedDuration: number | null;
  status: SessionStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  theme: Theme;
  accent: AppAccent;
  preferredCalendarView: CalendarView;
  weekStartsOn: 0 | 1;
  dailyCapacityMinutes: number;
}

export interface AppState {
  categories: Category[];
  projects: Project[];
  tasks: Task[];
  dependencies: TaskDependency[];
  sessions: PlannedSession[];
  settings: Settings;
}

export interface Backup extends AppState {
  format: 'foco-v2';
  exportedAt: string;
}
