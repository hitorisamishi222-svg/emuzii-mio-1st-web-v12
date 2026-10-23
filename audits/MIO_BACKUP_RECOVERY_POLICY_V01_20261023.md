# MIO Backup & Recovery Policy v0.1 (DRAFT / NOT DEPLOYED)

## Authority
- The currently running production application, its configuration, and its live data are the **only authoritative source**.
- Historical copies are recovery points, never a replacement source of truth during normal operation.
- Never write to or access the existing second-storage backup spreadsheet.
- Never replace production GAS with the repository's older root Code.gs.

## Target recovery objectives (not yet guaranteed)
- Data recovery-point objective (RPO): target <= 1 minute **only if** change capture, durable storage, and monitoring demonstrably support it.
- Recovery-time objective (RTO): establish through timed restore drills; no promised value before measurement.
- GAS/Sheets quotas and transaction boundaries must be measured before selecting a schedule.

## Architecture to validate
1. Capture a read-only, versioned full baseline of the **current** production data and deployed code/config (excluding secrets from export).
2. Capture subsequent committed changes with monotonically increasing sequence IDs, source record IDs, operation types, timestamps, and integrity hashes. Idempotent replays must never duplicate grants/draws.
3. Periodically write independent full checkpoints and immutable incremental change sets to a dedicated recovery destination, with restricted access and encryption. Never use the prohibited existing second-storage sheet.
4. Retain multiple generations (recent, daily, weekly); do not overwrite a last-known-good point. Alert on gaps, failed captures, integrity mismatches, or unexpected mass deletion.
5. Restore into an **isolated test destination first**. Verify participant IDs, attendance days/attempts, FA, predictions, gacha grants/consumption/draws, approvals and audit trails before any production recovery.
6. For production incidents: freeze unsafe writes where feasible; preserve an incident snapshot; identify the last valid point; calculate legitimate post-point changes; seek operator approval for the exact restore plan; restore only the affected scope and replay valid changes; compare before/after counts and hashes.
7. Code rollback and data recovery are separate operations. Never silently rewind current live data during a code rollback.

## Failure modes / safeguards
- A backup taken after corruption may also be corrupt: retain immutable earlier generations and anomaly signals.
- A 60-second snapshot alone does not guarantee <=60-second loss; failed runs and in-flight writes extend the gap.
- Sheets reads spanning multiple tabs are not atomic: use a mutation journal / commit watermark, or pause writes briefly for a consistent checkpoint.
- Do not store raw login tokens, passwords, or API secrets in ordinary backup artifacts.
- Never assume a backup is usable until an isolated restore and integrity check passes.

## Safe next implementation gate
- Read-only inventory of production data mutation paths, GAS quotas, deployment/source access, and available storage.
- Design an append-only journal that records actual writes without changing participant rights.
- Build a local fixture-based backup/replay test before any production deployment.
- Obtain explicit approval before creating backup infrastructure or modifying production.

Status: DESIGN ONLY. No scheduled backups, write hooks, or recovery service are active.
