-- v2.1.5 staging migration ONLY. Never apply to production without
-- verified backup and real account mapping. The existing expiration and
-- one-time consumption semantics in mio_passkey_challenges_v204 remain.
ALTER TABLE mio_passkey_challenges_v204
  ADD COLUMN IF NOT EXISTS bootstrap_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS bootstrap_browser_id text,
  ADD COLUMN IF NOT EXISTS bootstrap_method text;
ALTER TABLE mio_passkey_challenges_v204
  ADD CONSTRAINT mio_v215_bootstrap_consistency CHECK (
    (bootstrap_verified_at IS NULL AND bootstrap_browser_id IS NULL AND bootstrap_method IS NULL)
    OR
    (bootstrap_verified_at IS NOT NULL
      AND bootstrap_browser_id ~ '^MIO-W-[a-f0-9]{24}$'
      AND bootstrap_method IN ('approved-device-pairing','webauthn-uv'))
  );
CREATE INDEX IF NOT EXISTS mio_v215_bootstrap_lookup_idx
 ON mio_passkey_challenges_v204
 (mio_id,browser_token_hash,challenge_hash,bootstrap_browser_id)
 WHERE purpose='register' AND used_at IS NULL AND bootstrap_verified_at IS NOT NULL;
