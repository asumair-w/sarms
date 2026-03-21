-- =============================================================================
-- SARMS – Schema consolidated (review / apply to Supabase)
-- Generated for end-to-end review: ENUMs, tables, FKs, indexes.
-- RLS + Auth policies: apply in a later step (see bottom comments).
--
-- Dependency overview:
--   zones → workers (auth.users) → equipment → inventory
--   tasks (→ zones) → task_workers (→ workers)
--   sessions (→ tasks, workers, zones)
--   operations_log (→ tasks)
--   harvest_log (→ workers)
--   inventory_movements (→ inventory, workers optional)
--   equipment_tickets (→ equipment, workers)
--   resolved_tickets (→ equipment, workers)
--   settings (standalone)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- ENUM types
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE worker_role_enum AS ENUM ('worker', 'engineer', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE worker_department_enum AS ENUM ('farming', 'maintenance', 'inventory');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE worker_status_enum AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE task_type_enum AS ENUM ('farming', 'maintenance');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE task_status_enum AS ENUM (
    'pending_approval',
    'in_progress',
    'finished_by_worker',
    'completed',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE sessions_status_enum AS ENUM (
    'assigned',
    'in_progress',
    'finished_by_worker',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE equipment_status_enum AS ENUM ('active', 'under_maintenance', 'out_of_service');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- -----------------------------------------------------------------------------
-- 1) zones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zones (
  id             TEXT PRIMARY KEY,
  label_en       TEXT,
  label_ar       TEXT,
  label          TEXT,
  icon           TEXT,
  display_order  INTEGER NOT NULL DEFAULT 0,
  data           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_zones_display_order ON zones(display_order);

-- -----------------------------------------------------------------------------
-- 2) workers (linked to Supabase Auth)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code             TEXT,
  employee_id      TEXT NOT NULL UNIQUE,
  full_name        TEXT NOT NULL,
  phone            TEXT,
  email            TEXT,
  nationality      TEXT,
  role             worker_role_enum NOT NULL DEFAULT 'worker',
  department       worker_department_enum NOT NULL DEFAULT 'farming',
  status           worker_status_enum NOT NULL DEFAULT 'active',
  temp_password    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  skills           JSONB NOT NULL DEFAULT '[]'::jsonb,
  data             JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workers_role ON workers(role);
CREATE INDEX IF NOT EXISTS idx_workers_department ON workers(department);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_auth_user ON workers(auth_user_id);

-- -----------------------------------------------------------------------------
-- 3) equipment
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT,
  name               TEXT NOT NULL,
  name_ar            TEXT,
  zone               TEXT,
  status             equipment_status_enum NOT NULL DEFAULT 'active',
  last_service_at    DATE,
  next_service_at    DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ,
  data               JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_equipment_zone ON equipment(zone);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_next_service ON equipment(next_service_at);

-- -----------------------------------------------------------------------------
-- 4) inventory
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT,
  name          TEXT NOT NULL,
  category      TEXT,
  quantity      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL,
  min_qty       NUMERIC(12, 2),
  warning_qty   NUMERIC(12, 2),
  last_updated  TIMESTAMPTZ DEFAULT now(),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);

-- -----------------------------------------------------------------------------
-- 5) tasks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id                 TEXT PRIMARY KEY,
  code               TEXT,
  zone_id            TEXT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  batch_id           TEXT NOT NULL,
  task_type          task_type_enum NOT NULL,
  department_id      worker_department_enum NOT NULL,
  task_id            TEXT NOT NULL,
  priority           TEXT,
  estimated_minutes  INTEGER,
  notes              TEXT,
  status             task_status_enum NOT NULL DEFAULT 'pending_approval',
  grid_row           INTEGER,
  grid_col           INTEGER,
  grid_side          TEXT,
  flagged            BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now(),
  data               JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tasks_zone ON tasks(zone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);

-- -----------------------------------------------------------------------------
-- 6) task_workers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_workers (
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_id    UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (task_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_task_workers_task ON task_workers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_workers_worker ON task_workers(worker_id);

-- -----------------------------------------------------------------------------
-- 7) sessions (temporary operational state; optional hard delete after operations_log)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   TEXT,
  task_id                TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  worker_id              UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  worker_name            TEXT,
  department             TEXT,
  department_id          worker_department_enum NOT NULL,
  -- UI يمرّر أحياناً farming | maintenance | inventory (مثل جلسات المخزون)
  task_type_id           TEXT NOT NULL,
  task                   TEXT,
  zone                   TEXT,
  zone_id                TEXT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  lines_area             TEXT,
  start_time             TIMESTAMPTZ NOT NULL,
  expected_minutes       INTEGER NOT NULL DEFAULT 60,
  status                 sessions_status_enum NOT NULL DEFAULT 'assigned',
  finished_by_worker_at  TIMESTAMPTZ,
  closed_at              TIMESTAMPTZ,
  assigned_by_engineer   BOOLEAN NOT NULL DEFAULT true,
  assigned_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  flagged                BOOLEAN NOT NULL DEFAULT false,
  worker_notes           TEXT,
  image_data             TEXT,
  notes                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  data                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_worker ON sessions(worker_id);
CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_zone ON sessions(zone_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- -----------------------------------------------------------------------------
-- 8) operations_log (final task-execution snapshot after session close)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operations_log (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      TEXT,
  task_id                   TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  source_session_id         UUID NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_id                  TEXT,
  zone_id                   TEXT,
  zone_label                TEXT,
  department_id             worker_department_enum,
  department_label        TEXT,
  task_type                 task_type_enum,
  task_def_id               TEXT,
  task_label                TEXT,
  lines_area                TEXT,
  priority                  TEXT,
  grid_row                  INTEGER,
  grid_col                  INTEGER,
  grid_side                 TEXT,
  task_status_at_close      task_status_enum,
  task_snapshot             JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_time                TIMESTAMPTZ NOT NULL,
  expected_minutes          INTEGER NOT NULL,
  finished_by_worker_at     TIMESTAMPTZ,
  assigned_by_engineer      BOOLEAN NOT NULL DEFAULT true,
  flagged                   BOOLEAN NOT NULL DEFAULT false,
  session_status_at_close   TEXT,
  session_snapshot          JSONB NOT NULL DEFAULT '{}'::jsonb,
  timeline                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  worker_notes              TEXT,
  engineer_notes            TEXT,
  notes_raw                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments               JSONB NOT NULL DEFAULT '[]'::jsonb,
  workers_json              JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_by               UUID REFERENCES workers(id) ON DELETE SET NULL,
  approved_by               UUID REFERENCES workers(id) ON DELETE SET NULL,
  approved_at               TIMESTAMPTZ,
  data                      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_operations_log_task ON operations_log(task_id);
CREATE INDEX IF NOT EXISTS idx_operations_log_source_session ON operations_log(source_session_id);
CREATE INDEX IF NOT EXISTS idx_operations_log_created ON operations_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_log_zone_created ON operations_log(zone_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 9) harvest_log (manual harvest; independent of operations_log in this phase)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS harvest_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT,
  zone_id       TEXT NOT NULL,
  zone_label    TEXT NOT NULL,
  lines_area    TEXT NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL,
  quantity      NUMERIC(12, 2) NOT NULL,
  unit          TEXT NOT NULL,
  notes         TEXT,
  image_data    TEXT,
  recorded_by   UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ,
  updated_by    UUID REFERENCES workers(id) ON DELETE SET NULL,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_harvest_log_zone_recorded ON harvest_log(zone_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_harvest_log_recorded ON harvest_log(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_harvest_log_recorded_by ON harvest_log(recorded_by);

-- -----------------------------------------------------------------------------
-- 10) inventory_movements (no reason column in this phase)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  old_quantity           NUMERIC(12, 2) NOT NULL,
  new_quantity           NUMERIC(12, 2) NOT NULL,
  movement_type          TEXT,
  changed_by             TEXT,
  changed_by_worker_id   UUID REFERENCES workers(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  data                   JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inv_movements_item ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_created ON inventory_movements(created_at DESC);

-- -----------------------------------------------------------------------------
-- 11) equipment_tickets (active tickets)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment_tickets (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id           UUID NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  equipment_name         TEXT,
  ticket_type            TEXT NOT NULL,
  status                 TEXT NOT NULL,
  severity               TEXT,
  due_date               DATE,
  description            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_worker_id   UUID REFERENCES workers(id) ON DELETE SET NULL,
  data                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT equipment_tickets_ticket_type_chk
    CHECK (ticket_type IN ('fault', 'inspection', 'maintenance')),
  CONSTRAINT equipment_tickets_status_chk
    CHECK (status IN ('open', 'scheduled'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_tickets_equipment ON equipment_tickets(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_tickets_type ON equipment_tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_equipment_tickets_status ON equipment_tickets(status);
CREATE INDEX IF NOT EXISTS idx_equipment_tickets_due ON equipment_tickets(due_date);

-- -----------------------------------------------------------------------------
-- 12) resolved_tickets (completed tickets; source_ticket_id is NOT a FK)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resolved_tickets (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ticket_id          UUID NOT NULL,
  equipment_id              UUID NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  equipment_name            TEXT,
  ticket_type               TEXT NOT NULL,
  resolved_at               TIMESTAMPTZ NOT NULL,
  resolved_by_worker_id     UUID REFERENCES workers(id) ON DELETE SET NULL,
  summary                   TEXT,
  notes                     TEXT,
  ticket_snapshot           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  data                      JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT resolved_tickets_ticket_type_chk
    CHECK (ticket_type IN ('fault', 'inspection', 'maintenance'))
);

CREATE INDEX IF NOT EXISTS idx_resolved_tickets_equipment_resolved ON resolved_tickets(equipment_id, resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_resolved_tickets_type_resolved ON resolved_tickets(ticket_type, resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_resolved_tickets_resolved_at ON resolved_tickets(resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_resolved_tickets_source_ticket ON resolved_tickets(source_ticket_id);

-- -----------------------------------------------------------------------------
-- 13) settings (key-value)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key     TEXT PRIMARY KEY,
  value   JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- =============================================================================
-- RLS + policies: configure after Supabase Auth (phase 2).
-- Do NOT enable RLS here without policies — it would block all access.
-- Example next steps:
--   ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY ... USING (auth.uid() IS NOT NULL) ...
-- =============================================================================
