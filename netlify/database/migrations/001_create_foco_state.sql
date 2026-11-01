CREATE TABLE IF NOT EXISTS foco_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO foco_state (id, data)
VALUES (
  'default',
  '{"categories":[],"projects":[],"tasks":[],"dependencies":[],"sessions":[],"settings":{"theme":"system","preferredCalendarView":"week","weekStartsOn":1,"dailyCapacityMinutes":480}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
