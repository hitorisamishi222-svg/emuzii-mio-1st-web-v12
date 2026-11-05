-- UNAPPLIED candidate. Do not run against a production or shared branch.
-- Requires museum_public_exhibits and gallery_admin_users after a reviewed
-- backup + restore drill, verified isolated Neon endpoint and owner approval.
-- Immutable receipts make create/edit safely resolvable after lost COMMIT ACK.
-- No changes to attendance, gacha, participants or existing gallery rows.
CREATE TABLE IF NOT EXISTS museum_exhibit_draft_operations_stage (
 operation_id text PRIMARY KEY CHECK (operation_id ~ '^[a-f0-9]{32}$'),
 actor_id uuid NOT NULL REFERENCES gallery_admin_users(id),
 exhibit_id uuid NOT NULL REFERENCES museum_public_exhibits(id),
 action text NOT NULL CHECK (action IN ('create','edit')),
 payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
 revision integer NOT NULL CHECK (revision >= 0),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (exhibit_id,revision)
);
-- Only candidate DDL. No INSERT, UPDATE, publication or direct API route.
