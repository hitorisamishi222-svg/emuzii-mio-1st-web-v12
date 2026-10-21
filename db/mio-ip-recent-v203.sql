-- STAGING ONLY: manual migration for a dedicated registration database.
-- Does not touch existing GAS/participants, v202 IP audit, gacha or attendance.
CREATE TABLE IF NOT EXISTS mio_ip_recent_v203 (
  browser_id text NOT NULL CHECK(browser_id ~ '^MIO-W-[a-f0-9]{24}$'),
  ip_hash char(64) NOT NULL CHECK(ip_hash ~ '^[a-f0-9]{64}$'),
  ip_family smallint NOT NULL CHECK(ip_family IN (4,6)),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(browser_id,ip_hash)
);
CREATE INDEX IF NOT EXISTS mio_ip_recent_v203_expiry_idx
  ON mio_ip_recent_v203(last_seen);
-- A scheduled cleanup must remove rows older than 30 days, even when no visits occur:
-- DELETE FROM mio_ip_recent_v203 WHERE last_seen < now() - interval '30 days';
