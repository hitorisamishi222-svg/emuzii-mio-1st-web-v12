# MIO — Gacha/attendance consistency and dual-format backup, 2026-10-23

**Authority:** Live published Vercel deployment, live GAS, and live production Google Sheet. All materials inspected here are historical **single-time 15:45 JST** exported copies, never replacements for production.

## Read-only inspection results
- 28 worksheet export used as baseline. Source is a **previous read-only production spreadsheet export**, not a fresh current capture.
- Participants: 40; Gacha records: 40; Attendance records: 40; Web registration records: 38; Draw history entries: 61, including 25 confirmed; FA application entries: 25.
- Gacha entitlement arithmetic, Web confirmed-draw count vs history, remaining-turn count, and entitlement overuse: **0 detected inconsistencies** in the saved cached values.
- 31-day attendance check count, completion indicator, participant ID to name correspondence: **0 detected inconsistencies** in the saved cached values.
- No duplicate identity keys in the checked participant and Web registration ranges.
- No detected configured gacha/input review marker among checked participant rows.
- The audit does not assert correctness outside inspected source fields or after its capture time.

## Critical export/recalculation caveat
The first calculated-workbook reader produced **72 spurious name mismatches** in formula-derived cells. This was a recalculation problem: Google-specific QUERY/LET expressions transformed into Excel `__xludf.DUMMYFUNCTION` were not understood by the importer. Original XLSX **cached displayed names** remained intact. Direct XLSX cache-value comparison eliminated all 72 false positives; no live production data was changed.

Supplemental **values-only 28-tab** XLSX was produced locally, preserving 13,742 nonempty cached cell values. The original formula-enabled XLSX has 34,315 formula cells and 0 formula cells missing a cached value in this export. Value-only XLSX is a recovery reference **only**, not a restored app; it contains no formulas, macros, linked GAS script or external media.

The two XLSX files + private manifest + audit have been checked for ZIP CRC and verified with SHA-256 byte-for-byte roundtrip in a local archive. The archive contains sensitive participant data; never publish it or commit it to GitHub.

## What remains
- Verify live GAS source and production deployed GAS bridge contract (not substituted by stale GitHub Code.gs).
- Actual participant device recovery/real Markun test result.
- Independent backup of Neon data and media, operational minute-frequency backup (not active).
- Full application recovery needs isolated end-to-end test and explicit operator approval.

No production code/data edits or deployment. Legacy second-storage spreadsheet never accessed.
