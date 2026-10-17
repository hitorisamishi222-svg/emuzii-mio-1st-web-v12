-- Gallery admin session/device authorization hardening, isolated development DB only.
CREATE TABLE IF NOT EXISTS gallery_admin_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES gallery_admin_users(id),
 device_id uuid NOT NULL REFERENCES gallery_admin_devices(id),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gallery_admin_sessions_user_idx ON gallery_admin_sessions(user_id, expires_at);
CREATE TABLE IF NOT EXISTS gallery_admin_device_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES gallery_admin_users(id),
 device_id uuid NOT NULL REFERENCES gallery_admin_devices(id),
 request_token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 decided_by uuid REFERENCES gallery_admin_users(id),
 decided_at timestamptz,
 decision text CHECK (decision IN ('approved','denied')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gallery_admin_device_requests_pending_idx ON gallery_admin_device_requests(user_id,expires_at) WHERE decided_at IS NULL;
