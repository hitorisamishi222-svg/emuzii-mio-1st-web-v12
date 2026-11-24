-- MIO issuer-ID vNext / isolated schema proposal.
-- DO NOT apply to production, shared Neon, live GAS or real member data.
-- No ALTER / DROP / INSERT for any pre-existing registration, gacha or attendance object.
CREATE TABLE IF NOT EXISTS mio_access_issuers_v1 (
  issuer_id text PRIMARY KEY CHECK (issuer_id ~ '^[a-z][a-z0-9_-]{1,31}$'),
  display_name text NOT NULL,
  owner_user_id text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mio_access_accounts_v1 (
  master_id text PRIMARY KEY
    CHECK (master_id ~ '^MIO-([0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$'),
  issuer_id text NOT NULL REFERENCES mio_access_issuers_v1(issuer_id),
  rank text NOT NULL CHECK (rank IN ('fan','member')),
  member_until timestamptz,
  status text NOT NULL CHECK (status IN ('active','revoked')),
  generation bigint NOT NULL CHECK (generation >= 1),
  device_public_jwk jsonb,
  device_thumbprint text CHECK
    (device_thumbprint IS NULL OR device_thumbprint ~ '^sha256:[a-f0-9]{64}$'),
  session_hash char(64) UNIQUE,
  session_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_binding_pair_v1 CHECK (
    (device_thumbprint IS NULL) = (session_hash IS NULL)
    AND (session_expires_at IS NULL) = (session_hash IS NULL)
  ),
  CONSTRAINT account_public_key_v1 CHECK
    (device_public_jwk IS NULL OR device_thumbprint IS NOT NULL),
  CONSTRAINT account_membership_expiry_v1 CHECK
    (rank <> 'member' OR member_until IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS mio_access_invites_v1 (
  invite_id uuid PRIMARY KEY,
  master_id text NOT NULL REFERENCES mio_access_accounts_v1(master_id),
  issuer_id text NOT NULL REFERENCES mio_access_issuers_v1(issuer_id),
  generation bigint NOT NULL CHECK (generation >= 1),
  code_hash char(64) NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('issued','claimed','revoked')),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_one_active_invite_v1
  ON mio_access_invites_v1(master_id) WHERE status = 'issued';

CREATE TABLE IF NOT EXISTS mio_access_audit_v1 (
  operation_id uuid PRIMARY KEY,
  issuer_id text NOT NULL,
  master_id text NOT NULL,
  actor_id text NOT NULL,
  event text NOT NULL CHECK (event IN ('issue','revoke','rank_change')),
  generation bigint NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Challenges must be single-use and consumed in the same transaction
-- as invitation claim or authorized room access. A signature is NOT a session.
CREATE TABLE IF NOT EXISTS mio_access_challenges_v1 (
  challenge_id uuid PRIMARY KEY,
  issuer_id text NOT NULL REFERENCES mio_access_issuers_v1(issuer_id),
  nonce_hash char(64) NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('claim','room')),
  request_hash char(64) NOT NULL,
  bound_code_hash char(64),
  bound_device_thumbprint text CHECK (
    bound_device_thumbprint IS NULL OR
    bound_device_thumbprint ~ '^sha256:[a-f0-9]{64}$'
  ),
  bound_session_hash char(64),
  bound_room text CHECK (bound_room IS NULL OR bound_room IN ('fan','member')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_binding_v1 CHECK (
    (purpose='claim' AND bound_code_hash IS NOT NULL
      AND bound_device_thumbprint IS NOT NULL
      AND bound_room IS NULL AND bound_session_hash IS NULL)
    OR
    (purpose='room' AND bound_session_hash IS NOT NULL
      AND bound_room IS NOT NULL
      AND bound_code_hash IS NULL AND bound_device_thumbprint IS NULL)
  )
);
-- Database bootstrap of the real issuer 'mio' remains a separate
-- authorized, audited step after owner identity and roster validation.
