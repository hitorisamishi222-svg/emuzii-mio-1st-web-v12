-- MIO vNext: READ-ONLY preflight for the dedicated gallery-admin database.
-- Execute only after an owner confirms the correct connection.
-- No schema changes, data changes, secret displays or user rows.
-- This file is a checklist query, not an executable migration.
SELECT
 current_database() AS connected_database,
 current_schema() AS connected_schema,
 current_user AS connected_role,
 current_setting('server_version',true) AS postgres_version;

SELECT
 table_name,
 CASE WHEN to_regclass(format('%I.%I',current_schema(),table_name)) IS NULL
 THEN 'MISSING' ELSE 'PRESENT' END AS table_status
FROM (VALUES
 ('gallery_admin_users'),
 ('gallery_admin_devices'),
 ('gallery_admin_sessions'),
 ('gallery_admin_audit'),
 ('gallery_live_overrides'),
 ('anniversary_announcements'),
 ('anniversary_background_settings'),
 ('gallery_submissions')
) AS required(table_name)
ORDER BY table_name;

SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema=current_schema()
  AND table_name IN (
    'gallery_admin_users','gallery_admin_devices','gallery_admin_sessions',
    'gallery_admin_audit','gallery_live_overrides',
    'anniversary_announcements','anniversary_background_settings','gallery_submissions'
  )
ORDER BY table_name,ordinal_position;

SELECT schemaname,tablename,indexname,indexdef
FROM pg_indexes
WHERE schemaname=current_schema()
  AND tablename IN ('anniversary_background_settings','gallery_submissions','anniversary_announcements')
ORDER BY tablename,indexname;

-- Before changing an announcement/background/gallery-submission setting:
-- Compare the result against db/announcements.sql, db/anniversary-background.sql
-- and db/gallery-submissions.sql, then verify an approved backup.
-- Do NOT paste or print credentials; do NOT run migrations in this preflight.
