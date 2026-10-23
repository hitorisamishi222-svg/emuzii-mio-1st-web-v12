# MIO Backup: focused validation and production-connection gates (2026-10-23)

## Test execution policy (effective now)
- Default: run only tests for changed module(s), their direct dependencies, and one smoke test of the integration boundary.
- Do not re-run all 51 legacy/offline tests on every change. Their previously reported totals are historical, **not** evidence that current production backup works.
- Add a new test only for a new invariant, a previously uncovered failure mode, or a regression.
- Run complete regression once before release, on cross-cutting refactors, or after changing storage/serialization contracts.
- Record for each run: commit SHA, exact command, files changed, tests selected, pass/fail, and untested risks.
- Never label code review, fixture-only tests, or an unexecuted test suite as a live production test.

## Next high-value verification: read-only production inventory
1. Identify **every** production write entrypoint (GAS web app endpoints, direct Sheets edits, triggers, Neon/API writes). A journal covering only one endpoint is insufficient.
2. Identify the authoritative record keys for participants, attendance, FA, predictions, gacha and approvals. Identify non-atomic multi-sheet transactions.
3. Confirm read access to the current deployed GAS HEAD and deployment ID. GitHub root Code.gs and October 11 backups are NOT substitutes.
4. Determine an independent durable backup destination, auth model, quota/cost limits, and retention. Do not access the prohibited second-storage spreadsheet.
5. Test one **read-only** consistent capture on a staging fixture; show a source watermark and coverage proof. Do not treat two matching Sheets reads as proof of completeness.
6. Only then implement production write journal + minute-scale scheduling; prove real RPO with fault injection and isolated restore.

## Release blockers
- Current production GAS HEAD not independently verified.
- End-to-end write coverage and atomic checkpoint/watermark not proven.
- Durable independent destination not configured or tested.
- Actual one-minute RPO and isolated restore drill not proven.

Status: no production changes; no live automated backups enabled.
