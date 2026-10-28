-- vNext: Anniversary public background settings (姫/魔王).
-- Installation is a separate owner-approved migration, not a request-time action.
-- Confirm this is the DEDICATED gallery-admin database before applying.
-- Check backup, existing schema, gallery_admin_users/audit and permissions first.
-- Do not execute on GAS, participant, attendance or gacha data stores.
CREATE TABLE IF NOT EXISTS anniversary_background_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  theme TEXT NOT NULL CHECK (theme IN ('princess','devil')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
-- No setting is inserted by the migration: absent row remains the original princess theme.
-- First authorized save inserts revision 1; later changes require matching revision.
