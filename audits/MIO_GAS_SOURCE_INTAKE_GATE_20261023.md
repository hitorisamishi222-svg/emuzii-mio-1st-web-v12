# MIO live GAS source intake — minimum required evidence

Status: BLOCKED pending a **read-only export of the current production Apps Script project**. Neither GitHub Code.gs nor the October 11 Google Doc is an acceptable substitute.

Project: https://script.google.com/home/projects/11cJZBh9YzbFTd9ciqMbfgOWdfUEtfAbLAhdvkYipxT0B0_cMhes_xmJe/edit

## Exact intake requirements
- Every current source file, with original names/extensions (including .gs, .html, appsscript.json where available).
- Current deployments/version IDs and list of installable triggers, if accessible.
- No script execution, edits, saves, new deployments, or spreadsheet writes.
- Do not copy authentication secrets, private tokens, or user credentials into this repository.
- Do not read or modify the prohibited second-storage spreadsheet.

## Upon intake
1. Compute SHA-256 per file and an ordered manifest. Preserve the original read-only files.
2. Inventory every spreadsheet mutation, Forms submit trigger, external API write, scheduled job and direct manual edit pathway. Mark unknown paths explicitly.
3. Compare source behavior to observed live sheet schema; no automatic replacement of existing GAS.
4. Determine a capture barrier/watermark that covers all mutation paths, then choose a separate durable storage target.
5. Run only targeted integration tests and a single release smoke test. Do not repeat unchanged 51-test offline suite.

Release gate: never enable minute-scale backup until real capture completeness, durable retention, alarm, and isolated restore have been demonstrated.
