/**
 * This deployment intentionally stages disabled pairing endpoints only.
 * Existing login/check-in/gacha routes and screens remain unchanged.
 * Operator must explicitly set MIO_PAIR_AUTH_RELEASE to v1.9.4-ready
 * AFTER deploying and verifying matching Google Apps Script implementation.
 */
export function pairReleaseEnabled() {
 return process.env.MIO_PAIR_AUTH_RELEASE === 'v1.9.4-ready';
}
