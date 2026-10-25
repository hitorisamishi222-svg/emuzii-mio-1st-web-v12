-- Additive device recovery storage, staged only.
-- Apply only after identifying the EXISTING production database and backup.
-- No changes to Web registration credentials or participant history.
CREATE TABLE IF NOT EXISTS mio_device_grants (
  nonce_hash char(64) PRIMARY KEY,
  web_id varchar(64) NOT NULL,
  master_id varchar(32) NOT NULL,
  device_proof_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  issued_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mio_device_grants_web_id_ck CHECK (web_id ~ '^MIO-W-[a-f0-9]{24}$'),
  CONSTRAINT mio_device_grants_master_id_ck CHECK (master_id ~ '^MIO-[0-9]{4,}$'),
  CONSTRAINT mio_device_grants_nonce_ck CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT mio_device_grants_proof_ck CHECK (device_proof_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE IF NOT EXISTS mio_additional_devices (
  device_token_hash char(64) PRIMARY KEY,
  web_id varchar(64) NOT NULL,
  master_id varchar(32) NOT NULL,
  grant_nonce_hash char(64) NOT NULL UNIQUE REFERENCES mio_device_grants(nonce_hash),
  approved_by varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT mio_additional_devices_token_ck CHECK (device_token_hash ~ '^[a-f0-9]{64}$')
);
-- Transactional enrollment contract:
-- BEGIN;
-- UPDATE mio_device_grants SET consumed_at=now()
-- WHERE nonce_hash=$1 AND consumed_at IS NULL AND expires_at>now()
-- AND web_id=$2 AND master_id=$3 AND device_proof_hash=$4
-- RETURNING nonce_hash;
-- Require exactly one returned row, then insert additional device
-- with the same grant nonce; otherwise ROLLBACK.
-- COMMIT only after verifying the existing approved GAS Web-ID/MIO-ID.
