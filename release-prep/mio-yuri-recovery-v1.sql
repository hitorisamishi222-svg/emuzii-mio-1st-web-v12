-- Dedicated emergency owner-authorized one-use browser session recovery.
-- No changes to participant, gacha, attendance or historical draw tables.
CREATE TABLE IF NOT EXISTS mio_yuri_recovery_v1 (
 recovery_hash char(64) PRIMARY KEY CHECK (recovery_hash ~ '^[a-f0-9]{64}$'),
 browser_id text NOT NULL CHECK (browser_id = 'MIO-W-b502544b66bbb759c52114d1'),
 master_id text NOT NULL CHECK (master_id = 'MIO-0017'),
 token_hash char(64) NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,
 redeemed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mio_yuri_one_active_code_v1
 ON mio_yuri_recovery_v1(browser_id) WHERE redeemed_at IS NULL;
