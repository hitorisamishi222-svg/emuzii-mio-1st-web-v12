// Preview-only boundary for synthetic recovery registration.
// This module intentionally accepts one existing Vercel preview branch and
// one existing Neon isolated branch. It never enables the production path.
export const MIO_PREVIEW_BRANCH = 'feature/mio-three-level-registration-vnext-20261125';
// Vercel's stable branch alias differs from VERCEL_URL (the immutable deployment URL).
// Permit only the observed alias for this existing project and branch.
export const MIO_PREVIEW_ALIAS_HOST = 'emuzii-mio-1st-web-v12-git-feature-mio-t-85aa48-gtgz8867jh-3139.vercel.app';
const ALLOWED_TEST_IDS = new Set(['MIO-9998', 'MIO-9999']);

export function isSyntheticPreview(env, { host, origin } = {}) {
  const acceptedHosts = new Set([env?.VERCEL_URL, MIO_PREVIEW_ALIAS_HOST].filter(Boolean));
  if (!env || env.VERCEL_ENV !== 'preview' ||
      env.MIO_LEVEL_ADMIN_RELEASE !== 'preview-synthetic' ||
      env.MIO_LEVEL_PREVIEW_SYNTHETIC !== '1' ||
      env.VERCEL_GIT_COMMIT_REF !== MIO_PREVIEW_BRANCH ||
      !env.VERCEL_URL || !host || !acceptedHosts.has(host) ||
      origin !== `https://${host}`) return false;
  try {
    const u = new URL(env.MIO_LEVEL_DATABASE_URL);
    return ['postgres:', 'postgresql:'].includes(u.protocol) &&
      /^ep-dry-leaf-b7b7ph6q(?:-pooler)?(?:-f59)?\.c-13\.us-east-1\.aws\.neon\.tech$/.test(u.hostname);
  } catch {
    return false;
  }
}

export function isSyntheticTestId(masterId) {
  return ALLOWED_TEST_IDS.has(masterId);
}

export function syntheticRoster() {
  return {
    ok: true,
    roster: [
      {mioId: 'MIO-9998', name: 'Synthetic QA A', needsReview: false},
      {mioId: 'MIO-9999', name: 'Synthetic QA B', needsReview: false}
    ],
    approvedBrowsers: [
      {mioId: 'MIO-9999', verified: true, member: '確認済み'}
    ]
  };
}
