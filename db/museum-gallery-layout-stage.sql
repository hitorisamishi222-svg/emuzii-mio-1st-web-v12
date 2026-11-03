-- DRAFT ONLY. Unapplied candidate for the existing museum gallery DB.
-- Requires verified DB identity, restorable backup, owner approval and real PG tests.
-- Do NOT execute against production until the full one-release gate is approved.
-- No attendance, check-in, participant, gacha or existing gallery data is modified.
-- Layout metadata NEVER overrides live moderation or copyright/privacy review.

CREATE TABLE IF NOT EXISTS museum_gallery_layout_stage (
 layout_key text PRIMARY KEY CHECK (layout_key='main'),
 draft_revision bigint NOT NULL DEFAULT 0 CHECK (draft_revision>=0),
 draft_order jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(draft_order)='array' AND jsonb_array_length(draft_order)<=500),
 draft_visible_ids jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(draft_visible_ids)='array' AND jsonb_array_length(draft_visible_ids)<=500),
 draft_featured_id text CHECK (draft_featured_id IS NULL OR char_length(draft_featured_id)<=70),
 CHECK (draft_order @> draft_visible_ids),
 CHECK (draft_featured_id IS NULL OR draft_visible_ids ? draft_featured_id),
 drafted_by uuid REFERENCES gallery_admin_users(id),
 drafted_at timestamptz,
 published_revision bigint CHECK (published_revision IS NULL OR published_revision>=1),
 published_from_draft_revision bigint CHECK (published_from_draft_revision IS NULL OR published_from_draft_revision>=1),
 CHECK (published_from_draft_revision IS NULL OR published_from_draft_revision<=draft_revision),
 published_order jsonb,
 published_visible_ids jsonb,
 published_review_hashes jsonb CHECK (published_review_hashes IS NULL OR
  (jsonb_typeof(published_review_hashes)='object')),
 published_featured_id text CHECK (published_featured_id IS NULL OR char_length(published_featured_id)<=70),
 CHECK (published_order IS NULL OR published_visible_ids IS NULL OR published_order @> published_visible_ids),
 CHECK (published_featured_id IS NULL OR published_visible_ids ? published_featured_id),
 published_by uuid REFERENCES gallery_admin_users(id),
 published_at timestamptz,
 CHECK (
  (published_revision IS NULL AND published_from_draft_revision IS NULL
   AND published_order IS NULL AND published_visible_ids IS NULL
   AND published_review_hashes IS NULL AND published_featured_id IS NULL AND published_by IS NULL AND published_at IS NULL)
  OR
  (published_revision IS NOT NULL AND published_from_draft_revision IS NOT NULL
   AND published_order IS NOT NULL AND jsonb_typeof(published_order)='array'
   AND jsonb_array_length(published_order)<=500
   AND published_visible_ids IS NOT NULL AND jsonb_typeof(published_visible_ids)='array'
   AND jsonb_array_length(published_visible_ids)<=500
   AND published_review_hashes IS NOT NULL AND published_by IS NOT NULL AND published_at IS NOT NULL)
 )
);

-- A versioned history of each published snapshot allows reversible rollback.
-- Rollback must create a NEW published revision after rechecking live rights.
CREATE TABLE IF NOT EXISTS museum_gallery_layout_history_stage (
 history_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 layout_key text NOT NULL REFERENCES museum_gallery_layout_stage(layout_key),
 published_revision bigint NOT NULL CHECK (published_revision>=1),
 source_draft_revision bigint NOT NULL CHECK (source_draft_revision>=1),
 snapshot_order jsonb NOT NULL
  CHECK (jsonb_typeof(snapshot_order)='array' AND jsonb_array_length(snapshot_order)<=500),
 snapshot_visible_ids jsonb NOT NULL
  CHECK (jsonb_typeof(snapshot_visible_ids)='array' AND jsonb_array_length(snapshot_visible_ids)<=500),
 snapshot_review_hashes jsonb NOT NULL CHECK
  (jsonb_typeof(snapshot_review_hashes)='object'),
 snapshot_featured_id text CHECK (snapshot_featured_id IS NULL OR char_length(snapshot_featured_id)<=70),
 CHECK (snapshot_order @> snapshot_visible_ids),
 CHECK (snapshot_featured_id IS NULL OR snapshot_visible_ids ? snapshot_featured_id),
 published_by uuid NOT NULL REFERENCES gallery_admin_users(id),
 published_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (layout_key,published_revision)
);

-- Append-only operation receipts. One ID and payload always map to one action.
CREATE TABLE IF NOT EXISTS museum_gallery_layout_audit_stage (
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 layout_key text NOT NULL REFERENCES museum_gallery_layout_stage(layout_key),
 operation_id text NOT NULL UNIQUE CHECK (operation_id ~ '^[a-f0-9]{32}$'),
 payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL REFERENCES gallery_admin_users(id),
 action text NOT NULL CHECK (action IN ('draft','publish','rollback')),
 prior_revision bigint NOT NULL CHECK (prior_revision>=0),
 new_revision bigint NOT NULL CHECK (new_revision>prior_revision),
 recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Candidate ONLY: no DML, ALTER of existing tables, GRANT, or server route.
-- Future APIs MUST verify the actual approved gallery IDs and current
-- hidden/deleted flags in the SAME dedicated transaction before publish,
-- rollback or snapshot rendering. Serialized IDs are NOT publication rights.
-- On uncertain COMMIT check operation_id before replaying; never blindly retry.
