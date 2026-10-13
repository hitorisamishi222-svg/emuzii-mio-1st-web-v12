# MIO v2: access control and media rollout contract

Status: DESIGN / DEVELOPMENT ONLY. No production access or database changes.

## Trust boundary
- MIO-ID is an identifier, not proof of identity. Require authenticated, expiring server-issued sessions bound to a verified account.
- Never trust browser-provided role, member flag, device ID, nickname, or client-side localStorage as authorization.
- All admin operations check session and role server-side on every request. Deny by default (401 unauthenticated; 403 unauthorized).
- Require reauthentication for prizes, membership status, device replacement, and emergency switches; write audit logs without exposing secrets.
- The static admin-center-demo.html is locked until backend authorization is implemented. Hiding controls in CSS is only a preview safety measure, not an authorization boundary.

## Roles
- owner: full administrative scope
- operator: only explicitly delegated actions, no owner escalation
- member: own media submission only while membership is active
- participant: read published media, no upload or admin
- anonymous: public content only

## Music upload pipeline
1. Authenticated member requests a short-lived upload intent.
2. Server checks active membership, size quota, file extension, MIME and magic bytes; reserve a pending record tied to account ID.
3. Upload to private object storage with random object key; never use the supplied filename as a path.
4. Server validates actual file type, size and optionally scans; reject unsupported/corrupt media.
5. Keep pending content private; admin previews via short-lived authorized links and approves or rejects.
6. Only approved tracks get published media URLs and metadata. Revocation removes access.
7. Artwork is optional, limited to JPEG/PNG/WebP/GIF and validated separately. Text metadata is escaped, length-limited.
8. Rate-limit uploads and moderation actions. Preserve consent and rights attestations.

Suggested accepted audio: MP3, M4A, AAC, WAV, FLAC, OGG/OGA, OPUS. Browser playback varies: supply compatible transcodes when necessary. Start with 30 MB audio / 5 MB artwork per submission, adjust after cost review.

## Background playback
- Use a single persistent HTMLAudioElement in the music page; Media Session metadata/actions when supported.
- iOS/Android browser policies may suspend playback; page close/navigation does not guarantee continued audio.
- For cross-page continuous playback, a persistent app shell or native app architecture is required; do not promise it from independent static HTML pages.

## Gacha
- Server validates logged-in account, available draws, event state and inventory before drawing.
- Deduct one draw and record prize atomically, keyed by an idempotency key so retries do not double-spend.
- Use secure server-side random selection and immutable draw ledger; no prize authority in animation JS.
- Test against a separate dataset before production integration.

## Release gates
- Working auth, member validation, owner role assignment, private storage, moderation, rate limits, audit logs, gacha idempotency, integration tests, rollback plan.
- No automatic production deployment or real data migrations without explicit approval.

## Implementation progress (2026-10-13)
- Added pure role/music validation policy in v2-security-policy.mjs with regression tests.
- Added v2-gacha-engine.mjs transactional draw interface with secure random weighted rarity and idempotency key, plus tests.
- Production database, transaction isolation, unique constraints, authenticated session issuer, and API routes are NOT connected. These modules must not be represented as a working live draw service.
- The mock transaction in tests does not model concurrent requests; concurrency tests against a real transactional store are mandatory before production.
