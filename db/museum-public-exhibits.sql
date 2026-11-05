-- MIO Memorial Museum / Phase 2 — Public exhibit records only.
-- REQUIRED: confirm dedicated gallery-admin DB identity, permissions, and backup.
-- Execute manually after owner review. NEVER run from the public API.
-- Do not store private vault, MIO-ID, attendance, gacha, contact details or raw screenshots without privacy clearance.
CREATE TABLE IF NOT EXISTS museum_public_exhibits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('gallery','icons','moments','events')),
 -- "kind" is the exhibition ROOM; "category" is the media TYPE.
 -- Preserve both independently: a music work may be in the memories room.
 category text NOT NULL CHECK(category IN ('イラスト','動画','音声・楽曲','ファンアート','その他')),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),
 description text NOT NULL DEFAULT '' CHECK(char_length(description) <= 2000),
 credit text NOT NULL DEFAULT '' CHECK(char_length(credit) <= 80),
 occurred_on date,
 image_url text NOT NULL DEFAULT '' CHECK(char_length(image_url) <= 1024),
 external_url text NOT NULL DEFAULT '' CHECK(char_length(external_url) <= 2048),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','hidden','trash')),
 trashed_at timestamptz,
 revision integer NOT NULL DEFAULT 0 CHECK(revision >= 0),
 -- Draft exhibits must be saved without pretending rights and privacy review
 -- already happened. Publishing requires the four reviewed fields below.
 rights_checked_at timestamptz,
 privacy_checked_at timestamptz,
 reviewed_by uuid REFERENCES gallery_admin_users(id),
 published_at timestamptz,
 CHECK (status <> 'published' OR
   (rights_checked_at IS NOT NULL AND privacy_checked_at IS NOT NULL
    AND reviewed_by IS NOT NULL AND published_at IS NOT NULL)),
 -- A review completed AFTER publication cannot authorize the older version.
 -- Private drafts remain unaffected; publishing requires a new approval epoch.
 CHECK (status <> 'published' OR
   (rights_checked_at <= published_at AND privacy_checked_at <= published_at)),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS museum_public_exhibits_published_idx
 ON museum_public_exhibits (kind,occurred_on DESC,created_at DESC)
 WHERE status='published';
CREATE INDEX IF NOT EXISTS museum_public_exhibits_admin_idx
 ON museum_public_exhibits (status,updated_at DESC);
-- Do not INSERT sample exhibits or owner rows.
-- Trash keeps the whole exhibit record for owner restoration; no automatic physical deletion.
-- Existing gallery works are NOT migrated or rewritten by this schema.
