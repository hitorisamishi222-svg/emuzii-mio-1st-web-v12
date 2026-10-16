/**
 * A review-cell value alone cannot authorize a browser approval.
 * The caller must pass a separately verified, server-derived principal
 * with an explicit approval permission. This is pure staging code only.
 *
 * IMPORTANT: Apps Script installable triggers run under the trigger creator's
 * authorization, so Session.getEffectiveUser() does NOT identify the editor.
 * Session.getActiveUser().getEmail() can be empty. A missing identity is DENY.
 */
export function authorizeBrowserAdmin({principal, permission, verificationBoundTo} = {}) {
  if (!principal || principal.verified !== true || principal.source !== 'trusted-server') return false;
  if (typeof principal.id !== 'string' || !principal.id.trim()) return false;
  if (!Array.isArray(principal.permissions) || !principal.permissions.includes('browser:approve')) return false;
  if (permission !== 'browser:approve') return false;
  if (!verificationBoundTo || typeof verificationBoundTo.webId !== 'string' ||
      !verificationBoundTo.webId || typeof verificationBoundTo.mioId !== 'string' ||
      !verificationBoundTo.mioId) return false;
  return true;
}
