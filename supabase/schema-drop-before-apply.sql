-- =============================================================================
-- SARMS – حذف الجداول والأنواع القديمة قبل تطبيق schema-proposed.sql
-- شغّل هذا السكربت أولاً في Supabase SQL Editor، ثم شغّل schema-proposed.sql
-- تحذير: سيتم حذف كل البيانات في هذه الجداول.
-- =============================================================================

-- حذف الجداول (بالترتيب بسبب العلاقات بينها)
DROP TABLE IF EXISTS task_workers CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS harvest_log CASCADE;
DROP TABLE IF EXISTS records CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS faults CASCADE;
DROP TABLE IF EXISTS maintenance_plans CASCADE;
DROP TABLE IF EXISTS workers CASCADE;
DROP TABLE IF EXISTS equipment CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS zones CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- حذف أنواع ENUM (بعد حذف الجداول)
DROP TYPE IF EXISTS maintenance_type_enum CASCADE;
DROP TYPE IF EXISTS quality_outcome_enum CASCADE;
DROP TYPE IF EXISTS record_severity_enum CASCADE;
DROP TYPE IF EXISTS record_type_enum CASCADE;
DROP TYPE IF EXISTS task_type_enum CASCADE;
DROP TYPE IF EXISTS worker_status_enum CASCADE;
DROP TYPE IF EXISTS inventory_category_enum CASCADE;
DROP TYPE IF EXISTS fault_severity_enum CASCADE;
DROP TYPE IF EXISTS equipment_status_enum CASCADE;
DROP TYPE IF EXISTS worker_department_enum CASCADE;
DROP TYPE IF EXISTS worker_role_enum CASCADE;
DROP TYPE IF EXISTS priority_enum CASCADE;
DROP TYPE IF EXISTS task_status_enum CASCADE;
