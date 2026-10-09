-- NEXT TEST ONLY: review and execute only against a dedicated TEST PostgreSQL database.
-- NOT connected to the active anniversary system. Do not run against production.
BEGIN;
CREATE SCHEMA IF NOT EXISTS next_test;
REVOKE ALL ON SCHEMA next_test FROM PUBLIC;
CREATE TABLE IF NOT EXISTS next_test.community_profiles (
 profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 test_participant_ref text NOT NULL UNIQUE CHECK (length(test_participant_ref) BETWEEN 3 AND 120),
 display_name varchar(40) NOT NULL,
 verification_state text NOT NULL DEFAULT 'pending' CHECK (verification_state IN ('pending','verified','revoked')),
 community_write boolean NOT NULL DEFAULT false,
 identity_active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS next_test.community_messages (
 message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES next_test.community_profiles(profile_id),
 client_request_id uuid NOT NULL,
 body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 300),
 moderation_state text NOT NULL DEFAULT 'pending' CHECK (moderation_state IN ('pending','published','rejected','hidden')),
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 UNIQUE(profile_id,client_request_id)
);
CREATE INDEX IF NOT EXISTS idx_next_test_messages_public ON next_test.community_messages(moderation_state,created_at DESC);
CREATE TABLE IF NOT EXISTS next_test.community_media (
 media_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid NOT NULL REFERENCES next_test.community_profiles(profile_id),
 kind text NOT NULL CHECK (kind IN ('video','photo')),
 source text NOT NULL CHECK (source IN ('youtube','tiktok','upload')),
 title varchar(120) NOT NULL,
 description varchar(1000) NOT NULL DEFAULT '',
 external_url text,
 storage_key text,
 thumbnail_storage_key text,
 approval_state text NOT NULL DEFAULT 'pending' CHECK (approval_state IN ('pending','published','rejected','hidden')),
 permission_attested boolean NOT NULL DEFAULT false,
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_next_test_media_public ON next_test.community_media(approval_state,kind,published_at DESC);
CREATE TABLE IF NOT EXISTS next_test.community_reports (
 report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid REFERENCES next_test.community_profiles(profile_id),
 object_kind text NOT NULL CHECK (object_kind IN ('message','media')),
 object_id uuid NOT NULL,
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
 review_state text NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending','resolved','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS next_test.community_notices (
 notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title varchar(80) NOT NULL,
 body varchar(500) NOT NULL,
 external_url text,
 approved boolean NOT NULL DEFAULT false,
 public boolean NOT NULL DEFAULT false,
 starts_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);
CREATE TABLE IF NOT EXISTS next_test.community_controls (
 control_key text PRIMARY KEY CHECK (control_key IN ('community_posts','media_submissions','moderation')),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 actor_ref text NOT NULL DEFAULT 'system'
);
INSERT INTO next_test.community_controls(control_key,enabled) VALUES
 ('community_posts',false),('media_submissions',false),('moderation',false)
 ON CONFLICT(control_key) DO NOTHING;
CREATE TABLE IF NOT EXISTS next_test.community_audit (
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL,
 actor_ref text NOT NULL,
 action_name varchar(80) NOT NULL,
 target_kind varchar(40),
 target_id uuid,
 outcome text NOT NULL CHECK (outcome IN ('attempt','allowed','rejected','failure','rollback')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
-- Never expose direct client table access: every request goes through a separately authenticated server API.
-- Explicitly enforce RLS and fail-closed default (zero policies).
ALTER TABLE next_test.community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_media FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_notices FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE next_test.community_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA next_test FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA next_test FROM PUBLIC;
COMMIT;
