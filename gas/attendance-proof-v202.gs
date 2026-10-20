/**
 * MIO attendance bridge proof v2.0.2
 * Add to the EXISTING Apps Script project as a separate file, after comparing
 * live HEAD with the 2026-10-11 v1.9.1 reference. This file does not deploy itself.
 * Pure read-only predicate: no spreadsheet writes or identity linking.
 *
 * Call only inside doPost(action='status'), after BRIDGE_SECRET, participantId,
 * tokenHash, active device, and webIntegrityOk_() have been checked.
 * Inputs: the authenticated Web registration row and MATCHED rows from
 * emuzii_参加者 and emuzii_皆勤31日.
 */
function mioAttendanceProofV202_(webRow, peopleMatches, attendanceMatches) {
  var denied = {integratedParticipantId:'',attendanceLinked:false};
  if (!webRow || webRow[5] !== '承認済み' ||
      webRow[11] !== '確認済み' ||
      !/^MIO-W-[a-f0-9]{24}$/.test(String(webRow[0]||''))) return denied;
  var id = String(webRow[7]||'');
  if (!/^MIO-[0-9]{4}$/.test(id) || String(webRow[10]||'') !== id) return denied;
  // Column P is a recovery hint: missing is tolerated, conflicting is not.
  if (webRow[15] && String(webRow[15]) !== id) return denied;
  if (!Array.isArray(peopleMatches) || peopleMatches.length !== 1 ||
      !Array.isArray(attendanceMatches) || attendanceMatches.length !== 1) return denied;
  var person=peopleMatches[0],attendance=attendanceMatches[0];
  if (String(person[0])!==id || String(attendance[0])!==id ||
      String(person[1])!==String(webRow[2]) ||
      String(attendance[1])!==String(webRow[2])) return denied;
  return {integratedParticipantId:id,attendanceLinked:true};
}
