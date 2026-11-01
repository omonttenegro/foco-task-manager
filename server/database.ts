import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const migrations = [
  `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    categoryId TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    categoryId TEXT REFERENCES categories(id) ON DELETE SET NULL,
    projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
    parentTaskId TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','progress','done')),
    priority INTEGER CHECK(priority BETWEEN 1 AND 4),
    deadline TEXT,
    estimatedDuration INTEGER,
    completedAt TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE task_dependencies (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependsOnTaskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL,
    UNIQUE(taskId, dependsOnTaskId),
    CHECK(taskId <> dependsOnTaskId)
  );

  CREATE TABLE planned_sessions (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    plannedDate TEXT NOT NULL,
    plannedDuration INTEGER NOT NULL,
    completedDuration INTEGER,
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','done')),
    position INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX idx_projects_category ON projects(categoryId);
  CREATE INDEX idx_tasks_category ON tasks(categoryId);
  CREATE INDEX idx_tasks_project ON tasks(projectId);
  CREATE INDEX idx_tasks_parent ON tasks(parentTaskId);
  CREATE INDEX idx_dependencies_task ON task_dependencies(taskId);
  CREATE INDEX idx_dependencies_source ON task_dependencies(dependsOnTaskId);
  CREATE INDEX idx_sessions_task ON planned_sessions(taskId);
  CREATE INDEX idx_sessions_date ON planned_sessions(plannedDate);
  `
];

export function openDatabase(filename: string) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL);');
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((row) => row.version)
  );
  migrations.forEach((sql, index) => {
    const version = index + 1;
    if (applied.has(version)) return;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version,appliedAt) VALUES(?,?)').run(version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  return db;
}
