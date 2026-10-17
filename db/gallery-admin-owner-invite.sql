-- One-time, short-lived bootstrap invitation created exclusively by the owner-controlled operator.
CREATE TABLE IF NOT EXISTS gallery_admin_owner_invites (
 token_hash text PRIMARY KEY,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
