-- Dedicated gallery-admin schema. Apply only to a dedicated database after owner verification.
CREATE TABLE IF NOT EXISTS gallery_admin_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name text NOT NULL,
 role text NOT NULL CHECK (role IN ('owner','admin')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gallery_one_active_owner ON gallery_admin_users(role) WHERE role='owner' AND status='active';
CREATE TABLE IF NOT EXISTS gallery_admin_passkeys (
 credential_id text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES gallery_admin_users(id),
 public_key bytea NOT NULL,
 sign_count bigint NOT NULL DEFAULT 0,
 transports text[] NOT NULL DEFAULT '{}',
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gallery_admin_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES gallery_admin_users(id),
 device_public_id text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','revoked')),
 approved_by uuid REFERENCES gallery_admin_users(id),
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,device_public_id)
);
CREATE TABLE IF NOT EXISTS gallery_admin_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES gallery_admin_users(id),
 challenge_hash text NOT NULL UNIQUE,
 purpose text NOT NULL CHECK (purpose IN ('register','authenticate')),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gallery_admin_audit (
 id bigserial PRIMARY KEY,
 actor_id uuid REFERENCES gallery_admin_users(id),
 action text NOT NULL,
 target text,
 result text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gallery_published_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL,
 category text NOT NULL,
 creator text NOT NULL,
 external_url text NOT NULL,
 thumbnail_url text NOT NULL,
 created_by uuid NOT NULL REFERENCES gallery_admin_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- No owner row is inserted automatically. Bootstrap requires trusted identity verification.
