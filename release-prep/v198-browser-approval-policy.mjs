/**
 * Pure approval decision policy for v1.9.8 staging work.
 * This module has no spreadsheet access and is NOT wired to production.
 * All mutable state checks must be repeated under a single server-side lock.
 */
export function decideBrowserAddition(input) {
  const deny = (reason) => ({ allowed: false, reason, keepActiveWebIds: [] });
  if (!input || input.adminAuthorized !== true || input.verificationRecorded !== true) return deny('admin_verification_required');
  if (!input.targetWebId || !input.mioId ||
      input.verifiedWebId !== input.targetWebId ||
      input.verifiedMioId !== input.mioId) return deny('identity_changed');
  if (input.identityIntegrityOk !== true || input.matchingPersonCount !== 1) return deny('identity_inconsistent');
  if (!Array.isArray(input.activeWebIds) ||
      input.activeWebIds.some((x) => typeof x !== 'string' || !x) ||
      new Set(input.activeWebIds).size !== input.activeWebIds.length) return deny('invalid_active_browsers');
  const existing = input.activeWebIds.includes(input.targetWebId);
  if (!existing && input.activeWebIds.length >= 5) return deny('browser_limit');
  return { allowed: true, reason: existing ? 'already_active' : 'approved', keepActiveWebIds: [...input.activeWebIds] };
}
