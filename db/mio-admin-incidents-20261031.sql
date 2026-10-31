-- MIO incident inbox v1 — manual, reviewed migration for EXISTING PostgreSQL only.
-- Do not apply to production until the existing database, owner and backup are verified.
-- Does not touch participants, gacha, attendance, prize, or result tables.
BEGIN;
CREATE TABLE IF NOT EXISTS mio_admin_incidents (
 incident_id uuid PRIMARY KEY,
 fingerprint char(64) NOT NULL,
 participant_ref varchar(32) NOT NULL,
 source varchar(24) NOT NULL CHECK (source IN ('gacha','status')),
 category varchar(32) NOT NULL CHECK (category IN ('DRAW_UNKNOWN','DRAW_CLIENT_UNCONFIRMED','AUTH_COOKIE_MISSING','GAS_TIMEOUT','UPSTREAM_FAILED','STATUS_UNAVAILABLE')),
 draw_id char(32),
 stage varchar(24) NOT NULL,
 state varchar(12) NOT NULL DEFAULT 'unhandled' CHECK (state IN ('unhandled','working','resolved')),
 occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count>0),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 last_actor varchar(24),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (participant_ref ~ '^MIO-W-[a-f0-9]{24}$'),
 CHECK (draw_id IS NULL OR draw_id ~ '^[a-f0-9]{32}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_incidents_open_fingerprint
 ON mio_admin_incidents(fingerprint) WHERE state <> 'resolved';
CREATE INDEX IF NOT EXISTS mio_incidents_state_updated
 ON mio_admin_incidents(state,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS mio_incidents_participant
 ON mio_admin_incidents(participant_ref,occurred_at DESC);
CREATE TABLE IF NOT EXISTS mio_admin_incident_audit (
 operation_id char(32) PRIMARY KEY CHECK (operation_id ~ '^[a-f0-9]{32}$'),
 incident_id uuid NOT NULL REFERENCES mio_admin_incidents(incident_id),
 actor varchar(24) NOT NULL,
 action varchar(12) NOT NULL CHECK (action IN ('start','resolve')),
 before_state varchar(12) NOT NULL,
 after_state varchar(12) NOT NULL,
 payload_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
-- Rollback plan (only if no incident records needed):
-- DROP TABLE mio_admin_incident_audit;
-- DROP TABLE mio_admin_incidents;
