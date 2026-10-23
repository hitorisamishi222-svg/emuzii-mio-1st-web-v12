# MIO production write-path inventory (read-only, 2026-10-23)

Source inspected: GitHub main /Code.gs, blob SHA 6828891b3c52e59566cfab59e416e5d2a3363084. **This is NOT a verified copy of deployed GAS HEAD.**

Observed write paths in that file:
- Lines 11-19: Web registration sheet initialization/header/validation.
- Lines 49-57: admin control cells (setValue).
- Lines 79-103: doPost participant registration (appendRow + flush), guarded by ScriptLock.
- Line 155: check-in cell marker (setValue + flush).
- Lines 161-182: gacha sheet setup, headers, validation and formatting.
- Line 224: gacha draw result (appendRow + flush).

Risk: manual edits to the live spreadsheet, Apps Script triggers, other GAS source files, Neon and Vercel API mutations are NOT covered by this inventory. Thus a journal instrumented only in GitHub main/Code.gs cannot prove complete backup coverage.

Next targeted verification:
1. Obtain current deployed GAS HEAD read-only (all files) and deployment version.
2. Inventory triggers, external APIs, and manual sheet writes.
3. Validate an independent durable backup destination and consistent watermark.
4. Only then deploy journal capture behind a disabled-by-default flag, with isolated restore test.

No test rerun needed: this is source inventory only. No live production data changed.
