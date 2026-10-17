-- Additional safeguards for passkey challenge/device binding on the isolated gallery branch.
ALTER TABLE gallery_admin_challenges ADD COLUMN IF NOT EXISTS device_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS gallery_single_owner_account ON gallery_admin_users(role) WHERE role = 'owner';
