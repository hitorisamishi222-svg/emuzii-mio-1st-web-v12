/**
 * MIO v2.1.8 — PASSIVE / STAGING ONLY.
 * Pure function: no SpreadsheetApp, PropertiesService, LockService, writes,
 * triggers, setup functions, or automatic identity linking.
 *
 * IMPORTANT: Do not call from public doGet/doPost without authenticating the
 * bridge secret AND exact browser-id/token hash on the server first.
 * Input arrays must be read from the trusted MIO spreadsheet, not req.body.
 *
 * Explicit approval is required:
 * F=承認済み, H=canonical MIO, K=same MIO, L=確認済み,
 * P=same MIO, Q=使用中. The participant and attendance ledgers each have
 * exactly one matching ID/name row. Ambiguous states FAIL CLOSED.
 *
 * This helper is not deployed and changes no GAS permissions.
 */
function mioIdentityAttestationV218_(browserId, tokenHash, webRows, peopleRows, attendanceRows) {
  var denied = {
    integratedParticipantId: '',
    identityLinked: false,
    attendanceLinked: false,
    deviceActive: false
  };
  if(!/^MIO-W-[a-f0-9]{24}$/.test(String(browserId||'')) ||
     !/^[a-f0-9]{64}$/.test(String(tokenHash||'')) ||
     !Array.isArray(webRows) || !Array.isArray(peopleRows) ||
     !Array.isArray(attendanceRows)) return denied;

  // Reject duplicates by browser ID even if only one has the right token.
  var matches=webRows.filter(function(r) {
    return Array.isArray(r) && String(r[0]||'')===browserId;
  });
  if(matches.length!==1) return denied;
  var row=matches[0];
  if(String(row[1]||'')!==tokenHash ||
     String(row[5]||'')!=='承認済み' ||
     String(row[11]||'')!=='確認済み' ||
     // Explicit administrator device state, not default or inferred state.
     String(row[16]||'')!=='使用中') return denied;
  var mioId=String(row[7]||'');
  if(!/^MIO-[0-9]{4}$/.test(mioId) ||
     String(row[10]||'')!==mioId ||
     String(row[15]||'')!==mioId) return denied;
  var name=String(row[2]||'');
  if(!name || name!==name.trim() || name.length>40) return denied;

  // Only one person row may have this MIO-ID; name must match exactly.
  var people=peopleRows.filter(function(r) {
    return Array.isArray(r) && String(r[0]||'')===mioId;
  });
  if(people.length!==1 || String(people[0][1]||'')!==name) return denied;

  // Attendance proof is a separate permission. Do not grant from the
  // participant roster alone or from same-name entries.
  var attendance=attendanceRows.filter(function(r) {
    return Array.isArray(r) && String(r[0]||'')===mioId;
  });
  if(attendance.length!==1 || String(attendance[0][1]||'')!==name)
    return denied;

  return {
    integratedParticipantId: mioId,
    identityLinked: true,
    attendanceLinked: true,
    deviceActive: true
  };
}
