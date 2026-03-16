-- =============================================================================
-- SARMS – Production-ready schema (proposed)
-- ENUMs, UUID PKs, Foreign Keys, task_workers join table, indexes, RLS
-- Each table has data JSONB DEFAULT '{}'::jsonb for future optional attributes only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM types
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE task_status_enum AS ENUM (
    'pending_approval',
    'in_progress',
    'completed',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE priority_enum AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE worker_role_enum AS ENUM ('worker', 'engineer', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE worker_department_enum AS ENUM ('farming', 'maintenance', 'inventory');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE equipment_status_enum AS ENUM (
    'active',
    'under_maintenance',
    'out_of_service'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE fault_severity_enum AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE inventory_category_enum AS ENUM (
    'supplies',
    'packaging',
    'ppe',
    'tools',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE worker_status_enum AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE task_type_enum AS ENUM ('farming', 'maintenance');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE record_type_enum AS ENUM (
    'production',
    'quality',
    'inventory',
    'fault_maintenance'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE record_severity_enum AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE quality_outcome_enum AS ENUM ('pass', 'conditional', 'fail');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE maintenance_type_enum AS ENUM ('preventive', 'corrective', 'inspection');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 1) zones (TEXT PK – fixed system identifiers)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zones (
  id                TEXT PRIMARY KEY,
  label_en          TEXT,
  label_ar          TEXT,
  label             TEXT,
  icon              TEXT,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- -----------------------------------------------------------------------------
-- 2) workers (UUID PK)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       TEXT,
  full_name         TEXT NOT NULL,
  phone             TEXT,
  email             TEXT,
  nationality       TEXT,
  role              worker_role_enum NOT NULL DEFAULT 'worker',
  department        worker_department_enum NOT NULL DEFAULT 'farming',
  status            worker_status_enum NOT NULL DEFAULT 'active',
  temp_password     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  skills            JSONB NOT NULL DEFAULT '[]'::jsonb,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workers_role ON workers(role);
CREATE INDEX IF NOT EXISTS idx_workers_department ON workers(department);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);

-- -----------------------------------------------------------------------------
-- 3) equipment (UUID PK; zone is display label, no FK)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  category          TEXT,
  zone              TEXT,
  status            equipment_status_enum NOT NULL DEFAULT 'active',
  last_inspection   DATE,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_equipment_zone ON equipment(zone);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);

-- -----------------------------------------------------------------------------
-- 4) inventory (UUID PK)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  category          inventory_category_enum NOT NULL,
  quantity          NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit              TEXT NOT NULL,
  min_qty           NUMERIC(12,2),
  warning_qty       NUMERIC(12,2),
  last_updated      TIMESTAMPTZ DEFAULT now(),
  data              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);

-- -----------------------------------------------------------------------------
-- 5) tasks (UUID PK, FK zone_id → zones)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id             TEXT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  batch_id            TEXT NOT NULL,
  task_type           task_type_enum NOT NULL,
  department_id       worker_department_enum NOT NULL,
  task_id             TEXT NOT NULL,
  priority            priority_enum NOT NULL DEFAULT 'medium',
  estimated_minutes   INTEGER,
  notes               TEXT,
  status              task_status_enum NOT NULL DEFAULT 'pending_approval',
  grid_row            INTEGER,
  grid_col            INTEGER,
  grid_side           TEXT,
  flagged             BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  data                JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tasks_zone ON tasks(zone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);

-- -----------------------------------------------------------------------------
-- 6) task_workers (join table: task ↔ workers)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_workers (
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_id   UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (task_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_task_workers_task ON task_workers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_workers_worker ON task_workers(worker_id);

-- -----------------------------------------------------------------------------
-- 7) sessions (UUID PK, FKs worker_id → workers, zone_id → zones)
-- worker_name, zone, task are denormalized display fields for UI rendering.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id              UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  worker_name            TEXT,
  department             TEXT,
  department_id          worker_department_enum NOT NULL,
  task_type_id           task_type_enum NOT NULL,
  task                   TEXT,
  zone                   TEXT,
  zone_id                TEXT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  lines_area             TEXT,
  start_time             TIMESTAMPTZ NOT NULL,
  expected_minutes       INTEGER NOT NULL DEFAULT 60,
  flagged                BOOLEAN NOT NULL DEFAULT false,
  assigned_by_engineer   BOOLEAN NOT NULL DEFAULT true,
  notes                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  data                   JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_worker ON sessions(worker_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_zone ON sessions(zone_id);

-- -----------------------------------------------------------------------------
-- 8) records (UUID PK)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type       record_type_enum NOT NULL,
  worker            TEXT,
  department        TEXT,
  task              TEXT,
  zone              TEXT,
  lines             TEXT,
  lines_area        TEXT,
  quantity          NUMERIC(12,2) DEFAULT 0,
  unit              TEXT,
  date_time         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  duration          INTEGER,
  start_time        TIMESTAMPTZ,
  notes             TEXT,
  quality_outcome   quality_outcome_enum,
  severity          record_severity_enum,
  data              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_records_type ON records(record_type);
CREATE INDEX IF NOT EXISTS idx_records_date ON records(date_time);
CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at);

-- -----------------------------------------------------------------------------
-- 9) inventory_movements (UUID PK, FK item_id → inventory)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  old_quantity      NUMERIC(12,2) NOT NULL,
  new_quantity      NUMERIC(12,2) NOT NULL,
  reason            TEXT,
  movement_type     TEXT,
  changed_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  data              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inv_movements_item ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_created ON inventory_movements(created_at);

-- -----------------------------------------------------------------------------
-- 10) faults (UUID PK, FK equipment_id → equipment, SET NULL on delete)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faults (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id      UUID REFERENCES equipment(id) ON DELETE SET NULL,
  equipment_name    TEXT,
  category          TEXT NOT NULL,
  severity          fault_severity_enum NOT NULL,
  stop_work         BOOLEAN NOT NULL DEFAULT false,
  description       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  data              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_faults_equipment ON faults(equipment_id);
CREATE INDEX IF NOT EXISTS idx_faults_created ON faults(created_at);

-- -----------------------------------------------------------------------------
-- 11) maintenance_plans (UUID PK, FK equipment_id → equipment, CASCADE)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id      UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  equipment_name    TEXT,
  planned_date      DATE NOT NULL,
  type              maintenance_type_enum NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  data              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_maint_plans_equipment ON maintenance_plans(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_plans_date ON maintenance_plans(planned_date);

-- -----------------------------------------------------------------------------
-- 12) settings (key-value; no UUID)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key               TEXT PRIMARY KEY,
  value             JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- =============================================================================
-- Row Level Security (Supabase-compatible)
-- =============================================================================
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE faults ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read write zones" ON zones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write workers" ON workers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write equipment" ON equipment FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write task_workers" ON task_workers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write records" ON records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write inventory_movements" ON inventory_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write faults" ON faults FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write maintenance_plans" ON maintenance_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write settings" ON settings FOR ALL USING (true) WITH CHECK (true);
