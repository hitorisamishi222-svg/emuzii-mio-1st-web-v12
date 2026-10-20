# GAS attendance proof integration (staged; NOT deployed)

Target: EXISTING Apps Script project only. Keep the production script ID, spreadsheet and public URL unchanged.

## Prerequisites
1. Compare the live Apps Script HEAD with the latest approved Code.gs, especially doPost, status, webIntegrityOk_, webActualRows_ and checkinAction_. The GitHub root Code.gs is an older v6 reference and MUST NOT be pasted over the live v1.9.x project.
2. Back up all production GAS files. Do not run setup() or alter participant / attendance sheets.
3. Add `gas/attendance-proof-v202.gs` to the existing GAS project as a new helper file only, once the live status branch has been reviewed.

## In the authenticated doPost action='status' path ONLY

After existing BRIDGE_SECRET and tokenHash verification, active device check and webIntegrityOk_(r):

```javascript
var person=rows_(ss,'emuzii_参加者').filter(function(p){
  return p[0]===r[7] && p[1]===r[2];
});
var id=person.length===1?person[0][0]:'';
var att=rows_(ss,'emuzii_皆勤31日').filter(function(p){
  return id && p[0]===id && p[1]===r[2];
});
// Add exactly these fields to the existing successful status response:
var proof=mioAttendanceProofV202_(r,person,att);
out.integratedParticipantId=proof.integratedParticipantId;
out.attendanceLinked=proof.attendanceLinked;
```

Keep existing status `progress` and attendanceConfirmedDays/attendanceLockedDays. Do not add these fields to anonymous endpoints or registration responses. The proof is read-only, fails closed, and does not grant access by itself. `api-activate-attendance.js` separately requires an authenticated light cookie, independently approved Neon record and exactly matching GAS proof.

## Acceptance tests before flipping any release switch
- Approved existing GAS session retains current status/checkin functionality.
- New light registration is pending and cannot check in.
- Confirmed admin approval with correctly linked participant AND exactly one attendance row yields true.
- No attendance row, two attendance rows, mismatched name / MIO-ID, inactive browser, no administrator confirmation all deny access.
- Validate end-to-end with a real authorized test record, without creating fake production participants.
- Verify existing historical attendance, gacha and legacy approved sessions remain unchanged.

`MIO_ATTENDANCE_ACTIVATION` must remain unset until all checks succeed. Never assume that setting the release flag creates missing GAS or spreadsheet records.
