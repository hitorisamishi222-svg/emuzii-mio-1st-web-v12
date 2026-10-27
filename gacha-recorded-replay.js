/**
 * Read-only recovery of an ALREADY COMMITTED gacha result.
 *
 * Called only when the new-draw catalog contract is unsafe or unavailable.
 * Never issues a draw, spends an entitlement, or mutates persistent history.
 * A GAS history response may be capped at the 50 most recent draws:
 * absent / ambiguous matches always fail closed.
 */
export function recordedDrawFromHistory(history, expected) {
  if (!history || history.ok !== true || !expected ||
      history.participantId !== expected.participantId ||
      !Array.isArray(history.history) ||
      !/^MIO-W-[a-f0-9]{24}$/.test(expected.participantId || '') ||
      !/^[a-f0-9]{32}$/.test(expected.drawId || '') ||
      !['通常', 'ラキフェス'].includes(expected.mode)) return null;
  const matches = history.history.filter(row => row && row.drawId === expected.drawId);
  if (matches.length !== 1) return null;
  const row = matches[0];
  if (row.mode !== expected.mode ||
      typeof row.prize !== 'string' || !row.prize.trim() ||
      !Number.isSafeInteger(row.ordinal) || row.ordinal < 1) return null;
  return {
    ok: true,
    participantId: expected.participantId,
    drawId: expected.drawId,
    mode: expected.mode,
    prize: row.prize,
    ordinal: row.ordinal,
    rarity: typeof row.rarity === 'string' ? row.rarity : '',
    image: typeof row.image === 'string' ? row.image : '',
    replayed: true
  };
}
