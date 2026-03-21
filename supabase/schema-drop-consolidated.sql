-- =============================================================================
-- SARMS – drop consolidated schema (destructive). Run before schema-consolidated.sql
-- when rebuilding from scratch on Supabase.
-- =============================================================================

DROP TABLE IF EXISTS resolved_tickets CASCADE;
DROP TABLE IF EXISTS equipment_tickets CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS harvest_log CASCADE;
DROP TABLE IF EXISTS operations_log CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS task_workers CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS equipment CASCADE;
DROP TABLE IF EXISTS workers CASCADE;
DROP TABLE IF EXISTS zones CASCADE;

DROP TYPE IF EXISTS sessions_status_enum CASCADE;
DROP TYPE IF EXISTS task_status_enum CASCADE;
DROP TYPE IF EXISTS task_type_enum CASCADE;
DROP TYPE IF EXISTS equipment_status_enum CASCADE;
DROP TYPE IF EXISTS worker_status_enum CASCADE;
DROP TYPE IF EXISTS worker_department_enum CASCADE;
DROP TYPE IF EXISTS worker_role_enum CASCADE;
