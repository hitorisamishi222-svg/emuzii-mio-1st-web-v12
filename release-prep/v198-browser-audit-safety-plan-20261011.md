# v1.9.8 Browser approval / audit safety — draft only

Status: **DESIGN / NOT DEPLOYED**. No Apps Script execution, trigger modification, production sheet mutation, or Vercel release is authorized by this file.

## Verified observations from production screenshots and BrowserAddV189Patch.gs (2026-10-11)
- One installable spreadsheet onEdit trigger targets webRecoveryOnEditBrowserPatchV189_.
- emuzii_端末切替履歴 has 10 visible "ブラウザ追加" rows dated 2026-10-09; no later rows visible.
- refreshBrowserAddReviewV189Patch_ clears columns A:M then resets I (本人確認) to 未確認 and J (操作) to 保留, also clearing K/L (result/time).
- approveAdditionalBrowserV189Patch_ appends an audit row before updating approval fields; an exception can leave a misleading audit record.
- No maximum count of approved browsers per MIO-ID in this function.
- A separate switchApprovedWebRegistrationV189_ function handles replacement, and must be audited independently.

## Proposed changes (NOT implemented or validated yet)
1. Preserve pending verification across refresh by stable Web-ID + MIO-ID, not row position. Never copy an approval state across changed identities. Retain prior K/L results in append-only audit instead of relying on volatile review cells.
2. Apply a server-side maximum of 5 **active approved browser identities per MIO-ID** under the same lock as approval. Clarify whether the target is already counted; reject 6th active browser, do not retire an existing one automatically.
3. Validate unique Web-ID, H/K/P/L integrity, exact MIO-ID/name matching, and authenticated administrator action. A dropdown labeled 確認済み is not by itself proof of who performed verification.
4. Log intent and outcome separately (operation ID, timestamp, actor when verifiable, target Web-ID, MIO-ID, action, before/after states, success/failure). Preserve existing emuzii_端末切替履歴 rows unchanged. Avoid recording secrets/token hashes.
5. Audit manual F-column approvals and all other approval entry points: current onEdit trigger watches review J, not Web登録 F. Do not assume it captures all approval paths.
6. Keep attendance, gacha, prizes, FA, and original MIO-ID history untouched; no mass migration or automatic rejection of legacy approvals.
7. Check consistency with draft PR #20 (registration) and PR #22 (browser pairing), including race/replay/idempotency.

## Required tests before implementation or release
- Refresh retains verification for unchanged Web-ID+MIO-ID; clears it for identity changes; no accidental re-approval.
- Add browsers 1–5; reject 6th; existing 5 remain active; concurrent attempts cannot exceed limit.
- Failed writes generate failure outcome, not a success-only audit record; retry is idempotent.
- Admin action requires real authorization; malicious editing of review cells cannot approve.
- Legacy multiple approvals, retired devices, duplicate names, inconsistent H/K/P/L, pending membership and switch behavior.
- Checkin, gacha, draw history, FA data remain byte-for-byte unchanged.
- Tests on isolated spreadsheet and bound GAS with SHEET_ID and script properties pointing ONLY to staging; copied GAS currently references production SHEET_ID and MUST NOT be run as-is.
- Confirm deployment/version and rollback strategy before any production changes.

## Release gates
- Draft PR only, no merge.
- No changes to production GAS, triggers, Vercel env or published URL.
- Manual review of full BrowserAddV189Patch.gs and DeviceRecoveryV187.gs, including switchApprovedWebRegistrationV189_.
- Explicit user authorization for any live change after test evidence.
