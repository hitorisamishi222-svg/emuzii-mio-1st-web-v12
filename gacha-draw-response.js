/**
 * Validate GAS's draw result before acknowledging success to the browser.
 * A GAS draw can already be committed when its response arrives; on mismatch
 * the browser must retain the same drawId for read-only/idempotent recovery.
 * This validator NEVER sends another draw or changes a saved draw.
 */
export function isVerifiedGachaDrawResult(result, requested, participantId) {
  if (!result || typeof result !== 'object' || result.ok !== true ||
      !requested || result.participantId !== participantId ||
      result.drawId !== requested.drawId || result.mode !== requested.mode ||
      typeof result.prize !== 'string' || !result.prize.trim() ||
      !Number.isSafeInteger(result.ordinal) || result.ordinal < 1 ||
      typeof result.replayed !== 'boolean') return false;

  // Replay recovered from history need not include a remaining count.
  if (result.remaining !== undefined && result.remaining !== null &&
      (!Number.isSafeInteger(result.remaining) || result.remaining < 0)) return false;
  if (result.rarity !== undefined && typeof result.rarity !== 'string') return false;
  if (result.image !== undefined && typeof result.image !== 'string') return false;
  return true;
}
