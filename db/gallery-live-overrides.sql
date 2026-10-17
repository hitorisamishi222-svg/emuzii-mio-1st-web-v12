CREATE TABLE IF NOT EXISTS gallery_live_overrides (
 item_id text PRIMARY KEY,
 title text,
 creator text,
 description text,
 category text,
 external_url text,
 thumbnail_url text,
 hidden boolean NOT NULL DEFAULT false,
 deleted boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1,
 updated_by uuid REFERENCES gallery_admin_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT gallery_item_id_format CHECK (item_id ~ '^[a-z0-9-]{3,70}$')
);
CREATE INDEX IF NOT EXISTS gallery_live_overrides_updated_idx ON gallery_live_overrides(updated_at DESC);
