-- vNext fan-art applications. Execute only after verifying the dedicated
-- gallery database, schema version, owner authorization and backup.
-- DO NOT run on the participant/GAS spreadsheet database.
-- This migration is NEVER executed by a public request.
CREATE TABLE IF NOT EXISTS gallery_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  creator text NOT NULL CHECK (char_length(creator) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  category text NOT NULL CHECK (category IN ('動画','イラスト','音声・楽曲','ファンアート','その他')),
  external_url text NOT NULL CHECK (external_url ~ '^https://'),
  thumbnail_url text NOT NULL DEFAULT '' CHECK (char_length(thumbnail_url) <= 1024),
  consent boolean NOT NULL CHECK (consent = true),
  source_hash text NOT NULL CHECK (char_length(source_hash) = 64),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','hidden')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES gallery_admin_users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS gallery_submissions_link_unique
  ON gallery_submissions (lower(external_url));
CREATE INDEX IF NOT EXISTS gallery_submissions_source_created
  ON gallery_submissions (source_hash,created_at DESC);
CREATE INDEX IF NOT EXISTS gallery_submissions_status_created
  ON gallery_submissions (status,created_at DESC);
