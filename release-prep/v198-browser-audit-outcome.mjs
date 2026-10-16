/**
 * Isolated v1.9.8 audit outcome builder. Never write a "success" outcome
 * until the caller has completed and verified all relevant sheet updates.
 * Does not call Apps Script or touch production data.
 */
export function makeBrowserAuditOutcome({operationId, action, actorId, webId, mioId, phase, detail = ''}) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(operationId || '')) throw new Error('invalid operation id');
  if (!['browser_add', 'device_switch'].includes(action)) throw new Error('invalid action');
  if (!['attempt', 'success', 'failure'].includes(phase)) throw new Error('invalid phase');
  if (!actorId || !webId || !mioId) throw new Error('missing audit identity');
  return Object.freeze({operationId, action, actorId, webId, mioId, phase, detail: String(detail).slice(0, 300)});
}
