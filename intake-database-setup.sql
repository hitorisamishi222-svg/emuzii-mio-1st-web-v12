-- MIO pre-registration intake only. Do NOT run in the production event/gallery databases.
-- Provision a separate database named mio_intake in the existing managed Postgres project.
-- Provision a separate LOGIN role mio_intake_writer with a strong generated password.
-- Connect as the database owner/administrator to database mio_intake before running.
-- No existing MIO participant, check-in, or gacha table must be accessible to this role.

DO $safe$
BEGIN
  IF current_database() <> 'mio_intake' THEN
    RAISE EXCEPTION 'Wrong database: run only inside separate mio_intake database';
  END IF;
END
$safe$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS intake;
REVOKE ALL ON SCHEMA intake FROM PUBLIC;

CREATE TABLE IF NOT EXISTS intake.requests (
  idempotency_hash CHAR(64) PRIMARY KEY,
  requester_hash CHAR(64) NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new','device-change')),
  nickname TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 40),
  receipt_code VARCHAR(26) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_requests_rate_index
  ON intake.requests(requester_hash, created_at);

REVOKE ALL ON TABLE intake.requests FROM PUBLIC;
GRANT CONNECT ON DATABASE mio_intake TO mio_intake_writer;
GRANT USAGE ON SCHEMA intake TO mio_intake_writer;
GRANT SELECT, INSERT ON TABLE intake.requests TO mio_intake_writer;

-- WARNING: Retention cleanup must be performed by an authorized administrator,
-- not by the public API writer role. Configure an authenticated maintenance
-- operation before publishing a deletion deadline to users.
-- A future maintenance task can run:
-- DELETE FROM intake.requests WHERE created_at < now() - interval '30 days';
