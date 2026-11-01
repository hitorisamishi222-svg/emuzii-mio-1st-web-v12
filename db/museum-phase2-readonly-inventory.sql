-- MIO Memorial Museum — READ-ONLY schema inventory.
-- For manual review by the authorized DB owner only.
-- This does NOT apply a migration or change any data.
-- Do NOT execute against GAS, participant, gacha, check-in or other unrelated databases.
-- First confirm the database host/name against a trusted independent record.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '4s';

-- 1. Identify the connected database without disclosing its password.
SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_user AS connected_role;

-- 2. See which required and optional tables exist.
WITH wanted(name,importance) AS (
 VALUES ('gallery_admin_users','required'),
        ('gallery_admin_devices','required'),
        ('gallery_admin_sessions','required'),
        ('gallery_admin_audit','required'),
        ('museum_public_exhibits','required'),
        ('gallery_live_overrides','optional_asset_review')
)
SELECT w.name AS table_name, w.importance,
       (t.table_name IS NOT NULL) AS exists
FROM wanted w
LEFT JOIN information_schema.tables t
 ON t.table_schema=current_schema() AND t.table_name=w.name
ORDER BY w.importance,w.name;

-- 3. Compare columns, data types and nullability; metadata only.
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema=current_schema()
 AND table_name = ANY(ARRAY[
   'gallery_admin_users','gallery_admin_devices','gallery_admin_sessions',
   'gallery_admin_audit','museum_public_exhibits','gallery_live_overrides'
 ])
ORDER BY table_name,ordinal_position;

-- 4. Confirm actual status CHECK and foreign-key constraints.
-- CREATE TABLE IF NOT EXISTS alone is NOT sufficient to upgrade old constraints.
SELECT t.relname AS table_name,c.conname AS constraint_name,
       c.contype AS constraint_type,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname=current_schema()
 AND t.relname IN ('museum_public_exhibits','gallery_admin_sessions','gallery_admin_devices')
ORDER BY t.relname,c.conname;

-- No INSERT/UPDATE/DELETE/CREATE/ALTER statements.
COMMIT;
