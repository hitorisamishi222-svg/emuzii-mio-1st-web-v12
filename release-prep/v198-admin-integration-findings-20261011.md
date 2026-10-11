# Admin authorization integration findings (2026-10-11)

Reviewed main branch `index.html`, `api-browser-pair-create.js`, and `api-browser-pair-claim.js`.

- The public `index.html` contains participant registration, not a verified administrator login flow.
- Browser-pair create/claim endpoints use participant session cookies. A participant session is **not** an administrator authorization token.
- Production GAS browser approval is currently initiated by spreadsheet edits. An installable edit trigger's effective user identifies its creator, not necessarily the editor. Active user email can be blank. Therefore neither effective-user nor an editable checkbox is a sufficient administrator identity.
- Do not connect the new pure `authorizeBrowserAdmin` helper with a fabricated `trusted-server` principal. Its inputs are a contract, not a real login implementation.
- The existing `api-browser-pair-*` endpoints are NOT an admin control plane. Never grant `browser:approve` based on a participant cookie, ColorSing name, login ID, or possession of Web-ID.
- Safe implementation needs a real admin authentication/authorization mechanism and server-side verification of the target identity and operation. Consider a protected, authenticated admin endpoint with short-lived per-operation authorization and an auditable actor; design must be reviewed against existing deployments and secrets.
- Preserve production sheet, public URL, participant checkins, gacha and prize history. No new login prompt should block ordinary participants.

**Release status: BLOCKED** until an actual administrator identity source is implemented and verified in staging. No deploy or merge of PR #23.
