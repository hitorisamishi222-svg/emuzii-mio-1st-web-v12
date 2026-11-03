-- DRAFT ONLY: proposed museum public gallery ordering/featured metadata.
-- Unapplied candidate. NO connection or migration is performed by this repo.
-- Owner must confirm actual gallery DB identity, schema and restorable backup first.
-- Keep all attendance, check-in, participant, prize and gacha data untouched.
-- Layout metadata NEVER grants image/publication permission.
-- Current public gallery takedowns and rights decisions remain authoritative.
-- Reviewer must also approve atomic audit, role auth, conflict and rollback behavior.

CREATE TABLE IF NOT EXISTS museum_gallery_layout_stage (
 layout_key text PRIMARY KEY CHECK(layout_key='main'),
 draft_revision bigint NOT NULL DEFAULT 0 CHECK(draft_revision>=0),
 draft_order jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK(jsonb_typeof(draft_order)='array' AND jsonb_array_length(draft_order)<=500),
 draft_visible_ids jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK(jsonb_typeof(draft_visible_ids)='array' AND jsonb_array_length(draft_visible_ids)<=500),
 draft_featured_id text CHECK(draft_featured_id IS NULL OR char_length(draft_featured_id)<=70),
 drafted_by uuid REFERENCES gallery_admin_users(id),
 drafted_at timestamptz,
 published_revision bigint,
 published_order jsonb,
 published_visible_ids jsonb,
 published_featured_id text,
 published_by uuid REFERENCES gallery_admin_users(id),
 published_at timestamptz,
 CHECK(
  (published_revision IS NULL AND published_order IS NULL
   AND published_visible_ids IS NULL AND published_featured_id IS NULL
   AND published_by IS NULL AND published_at IS NULL)
  OR
  (published_revision IS NOT NULL AND published_revision>=0
   AND published_order IS NOT NULL AND jsonb_typeof(published_order)='array'
   AND jsonb_array_length(published_order)<=500
   AND published_visible_ids IS NOT NULL AND jsonb_typeof(published_visible_ids)='array'
   AND jsonb_array_length(published_visible_ids)<=500
   AND published_by IS NOT NULL AND published_at IS NOT NULL)
 )
);

CREATE TABLE IF NOT EXISTS museum_gallery_layout_audit_stage (
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 layout_key text NOT NULL REFERENCES museum_gallery_layout_stage(layout_key),
 operation_id text NOT NULL UNIQUE CHECK(operation_id ~ '^[a-f0-9]{32}$'),
 actor_id uuid NOT NULL REFERENCES gallery_admin_users(id),
 action text NOT NULL CHECK(action IN ('draft','publish','rollback')),
 prior_revision bigint NOT NULL CHECK(prior_revision>=0),
 new_revision bigint NOT NULL CHECK(new_revision>prior_revision),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
-- No INSERT, UPDATE, ALTER, DELETE, DROP, GRANT or automatic activation.
-- Future API must verify the approved IDs and all current hidden/deleted takedowns
-- from the authoritative DB again inside ONE transaction before every publish.
-- The JSON arrays alone MUST NEVER be interpreted as permission to publish.
-- Future audit and draft persistence must use a dedicated transaction client.
-- On uncertain COMMIT, recheck the same operation_id instead of retrying changes.
-- No existing gallery schema is modified by this proposal.
