# MIO single-target XLSX restoration drill — 2026-10-23

Scope: previously exported production spreadsheet held as a private XLSX copy in an independent Drive folder. This test uses the file downloaded from that private copy. This is NOT a deployed GAS or web application restoration.

Results:
- Isolated copy byte-for-byte integrity (SHA-256): PASS
- XLSX CRC, sheet count and structure: PASS
- 28 worksheets opened through a separate Excel importer: PASS
- Eight core record domains present: PASS
- Intentionally truncated copy rejected, original retained: PASS
- No full regression tests rerun; no participant values embedded in this report.
- No production change, deployment, or legacy second-backup access.

Separate existing semantic audit: 28 of 28 sheets, 58,473 stored cells and 25,652 formula cells matched between original export and Drive readback. That previously passed audit was NOT rerun here.

Limitations:
1. Snapshot atomicity, live source-wide watermark and complete write coverage not proven.
2. The private Google Drive folder is separate from production but is still within the same Google account/failure domain.
3. Google Sheets features not represented by XLSX, external media, GAS/trigger source, Neon and end-to-end app restoration are untested.
4. Minute-level scheduled backup and production RPO remain unimplemented.

Release decision: file-level backup/restore gate passes; production disaster-recovery gate remains blocked.
