-- ISOLATED MIGRATION PROPOSAL. DO NOT apply to live Neon until complete tests.
-- No CASCADE and no alterations to legacy MIO/GAS/attendance/gacha tables.
CREATE TABLE IF NOT EXISTS mio_access_issuers_v1 (
 issuer_id text PRIMARY KEY CHECK (issuer_id ~ '^[a-z][a-z0-9_-]{1,31}$'),
 display_name text NOT NULL,
 owner_user_id text NOT NULL,
 active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mio_access_accounts_v1 (
 master_id text PRIMARY KEY CHECK (master_id ~ '^MIO-([0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$'),
 issuer_id text NOT NULL REFERENCES mio_access_issuers_v1(issuer_id),
 rank text NOT NULL CHECK (rank IN ('fan','member')),
 member_until timestamptz,
 status text NOT NULL CHECK (status IN ('active','revoked')),
 generation bigint NOT NULL CHECK (generation>=1),
 device_thumbprint text CHECK (device_thumbprint IS NULL OR device_thumbprint ~ '^sha256:[a-f0-9]{64}$'),
 session_hash char(64) UNIQUE,
 session_expires_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT bound_pair CHECK ((device_thumbprint IS NULL) = (session_hash IS NULL)),
 CONSTRAINT member_must_expire CHECK(rank<>'member' OR member_until IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS mio_access_invites_v1 (
 invite_id uuid PRIMARY KEY,
 master_id text NOT NULL REFERENCES mio_access_accounts_v1(master_id),
 issuer_id text NOT NULL REFERENCES mio_access_issuers_v1(issuer_id),
 generation bigint NOT NULL CHECK(generation>=1),
 code_hash char(64) NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('issued','claimed','revoked')),
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_one_active_invite_v1 ON mio_access_invites_v1(master_id) WHERE status='issued';
CREATE TABLE IF NOT EXISTS mio_access_audit_v1 (
 operation_id uuid PRIMARY KEY,
 issuer_id text NOT NULL,
 master_id text NOT NULL,
 actor_id text NOT NULL,
 event text NOT NULL CHECK(event IN ('issue','revoke','rank_change')),
 generation bigint NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
-- Separate administrator-controlled bootstrap required: issuer 'mio' is NOT auto-created.
