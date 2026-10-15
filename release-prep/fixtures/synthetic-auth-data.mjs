// Reusable synthetic accounts for isolated auth tests only.
// These identifiers/passwords are invented fixtures; never use them for participants or production.
export const syntheticAuthFixtures = Object.freeze({
  browserPrimary: Object.freeze({
    mioId: 'SYNTH-BROWSER-MIO-001',
    loginId: 'Browser_User2026',
    password: 'Synthetic-Browser-Password-2026!',
  }),
  browserNegative: Object.freeze({
    mioId: 'SYNTH-NEGATIVE-MIO-001',
    loginId: 'Negative_User2026',
    password: 'Synthetic-Negative-Password-2026!',
  }),
  wrongPassword: 'Wrong-Synthetic-Password-2026!',
  unknownLoginId: 'Missing_User2026',
  duplicateRaceWinner: Object.freeze({
    mioId: 'SYNTH-RACE-MIO-001',
    loginId: 'Race_UserA2026',
    password: 'Synthetic-Race-Password-A-2026!',
  }),
  duplicateRaceContender: Object.freeze({
    mioId: 'SYNTH-RACE-MIO-002',
    loginId: 'Race_UserB2026',
    password: 'Synthetic-Race-Password-B-2026!',
  }),
  historyOwner: Object.freeze({
    mioId: 'SYNTH-HISTORY-MIO-001',
    loginId: 'History_User2026',
    password: 'Synthetic-History-Password-2026!',
  }),
});

export function getSyntheticAuthFixture(name) {
  const fixture = syntheticAuthFixtures[name];
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    throw new Error(`unknown synthetic auth fixture: ${String(name)}`);
  }
  return {...fixture};
}
