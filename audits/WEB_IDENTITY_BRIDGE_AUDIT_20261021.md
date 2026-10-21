# Web identity bridge audit 2026-10-21

Inspected main: api-register.js, bridge.js, registration-attempt.js.

Verified: mio_session is HMAC-signed, HttpOnly, Secure, SameSite=Lax with 90-day maximum. readSession validates cookie signature and syntax, not actual GAS approval or MIO-ID ownership. Pending registration cookie is signed and 24-hour limited; retry key can derive a stable registration identity for 15 minutes. api-register.js uses an explicit release gate and sends a web ID, token hash, name, login ID to GAS. The d.verified response signals saved registration, not proven human identity.

Security requirements: Never equate a valid cookie with verified MIO-ID ownership. Separate limited access from identity verified, approved and active device states. Do not count IP/name/MIO-ID/loginId/User-Agent as independent strong identity factors. Audit all backend authorization guards for gallery, forms, attendance and gacha before changes. WebAuthn needs server challenge, origin/RP validation, replay protection and revocation. Maximum five active browser registrations without silent eviction. No production edits in this audit.
