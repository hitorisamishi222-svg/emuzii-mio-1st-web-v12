# v1.9.8 integration security review — 2026-10-11

**Status:** Review only. No live changes.

## Existing trigger behavior
The currently observed installable onEdit handler is `webRecoveryOnEditBrowserPatchV189_`, which responds to `emuzii_重複整理!J` and N2. It does **not** by itself audit edits to `emuzii_Web登録!F`. The legacy `webRecoveryOnEdit_` in `APPS_SCRIPT_DeviceRecovery_v1.8.7.gs` can reject other approved devices when invoked. Do not restore this old trigger.

## Critical authorization issue
The current v1.8.9 handler checks only whether review column I says `確認済み` before approving a browser or switching devices. Any editor of the spreadsheet with access to columns I and J may be able to invoke an approval. An editable dropdown is **not authentication**. The pure `decideBrowserAddition` policy requires `adminAuthorized`, but it is **not yet connected to a verifiable administrator identity**. Never hard-code `adminAuthorized: true` based on the dropdown. Until a trusted identity mechanism is designed and tested, keep deployment blocked.

## Race and integrity
- Check the active browser count inside the Apps Script lock, immediately before approval.
- Validate that the review row still points to the same Web-ID and MIO-ID as the source row, and require a verification record bound to those identifiers.
- Avoid overwriting `確認済み` review state on refresh for unchanged identity; invalidate when identity changes.
- The existing audit append occurs before approval writes. Treat it as an **attempt**, not a confirmed success. Use distinct outcome records with operation IDs; log exceptions as failures and do not claim rollback of partial sheet writes.
- Current `approveAdditionalBrowserV189Patch_` is not enough to establish a maximum 5-browser policy or verified actor identity.
- `switchApprovedWebRegistrationV189_` implementation has not been reviewed in full in this task. No switch approval until reviewed.
- Apps Script onEdit triggers are not a reliable universal audit mechanism for changes made by other scripts or external APIs.

## Staging gates
1. Verify isolated copy has its own spreadsheet ID, secondary backup ID, script properties, triggers, and deployments; current copy retains the production SHEET_ID.
2. Implement server-side admin authorization with a verifiable principal and explicit per-operation authorization.
3. Run identity, concurrency, failure injection, idempotency, legacy duplicate, and history preservation tests.
4. Only after explicit user approval plan production rollout and rollback. PR #23 remains draft.
