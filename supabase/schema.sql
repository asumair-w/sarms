-- SARMS Supabase schema
-- Run this in Supabase Dashboard → SQL Editor (New query) → Run

-- Each table stores app data as (id, data JSONB).
-- The app uses the same shape as before; we persist the full object in data.

-- Workers (engineer/manage workers)
CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Zones (zone list for tasks/sessions)
CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Tasks (assign task)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Production/quality/inventory/fault records (reports)
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Active work sessions (monitor active work)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Inventory items
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Inventory movement log
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Equipment
CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Faults (log fault / maintenance)
CREATE TABLE IF NOT EXISTS faults (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Maintenance plans
CREATE TABLE IF NOT EXISTS maintenance_plans (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'
);

-- Key-value for batches_by_zone and default_batch_by_zone
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'
);

-- Enable RLS (optional; allow all for now so app anon key works)
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE faults ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policies: allow anon to read/write (for demo; tighten later with Auth)
CREATE POLICY "Allow anon read write workers" ON workers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write zones" ON zones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write records" ON records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write inventory_movements" ON inventory_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write equipment" ON equipment FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write faults" ON faults FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write maintenance_plans" ON maintenance_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read write settings" ON settings FOR ALL USING (true) WITH CHECK (true);
