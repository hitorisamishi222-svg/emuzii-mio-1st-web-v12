# API authorization review 2026-10-21

Read-only inspection of main branch.

api-status.js: POST and production checked by prepare(); requires signed mio_session; sends participantId and tokenHash to GAS status; renews cookie only when GAS status is approved. GAS state is authoritative.

api-checkin.js: requires signed session, validates day 1..31 and keyword length, sends identity+keyword+day to GAS checkin; cookie renewed after GAS success. Approval, attempt limits, and MIO-ID integrity are GAS responsibilities.

api-gacha.js: requires signed session, action whitelist catalog/draw/history, validates drawId and mode, sends identity to GAS; cookie renewed after success. Approval, device status, gacha switch, idempotency and draw limits are GAS responsibilities.

No files at root named api-gallery.js or api-form.js; this does NOT establish where form/gallery access checks are implemented. Need inspect actual frontend routes and any separate services.

Risk: session cookie signature authenticates a browser credential, not person-to-MIO-ID ownership. Backend must fail closed for protected attendance/gacha mutations and distinguish limited registration access. No production changes made.
