# Dummy Markun focused login rehearsal — 2026-10-23

**Scope:** Offline simulation of the deployed Web handler (GitHub commit `38208c9238cb9268488251697e85e3f86ff66135`), NOT real Markun, live GAS, or production identity mutation. The actual handler, cookie and approval-proof source files matched their original Git blob SHA-1. Fake GAS/Neon response modules were injected using Node VM; no network calls.

Command: `node --no-warnings --experimental-vm-modules --test tests/mio-dummy-markun-isolated.test.mjs` in the isolated local fixture.

Result: **7 passed, 0 failed**, covering independently approved new browser/canonical ID, stale GAS response rejection, alias mismatch rejection, review-pending rejection, token mismatch rejection, existing-cookie duplicate rejection, and disabled release-flag rejection.

Test fixture: dummy name, artificial `MIO-9001` canonical and `MIO-9002` alias; no real participant IDs changed. In-memory attendance/gacha/FA/prediction fixture remained unchanged. This does **not** prove live historical data preservation.

Live integration blockers:
1. Production GAS HEAD remains unverified. GitHub `Code.gs` omits fields expected by Web approval proof; whether deployed GAS does so is unknown.
2. Vercel project environment-variable listing (values not decrypted) did not include `MIO_ATTENDANCE_ACTIVATION` or `MIO_REGISTRATION_RELEASE`. With absent runtime flags the endpoints fail closed by design. Do not enable them before live GAS contract verification.
3. Real device login and live recovery remain untested. Wait for actual Markun's login result.

No change to production system, GAS, spreadsheets, Neon, or historical backups. No rerun of previously passing broad test suite.

Status: Web-side focused simulation PASS; end-to-end new-device login **not yet cleared**.
