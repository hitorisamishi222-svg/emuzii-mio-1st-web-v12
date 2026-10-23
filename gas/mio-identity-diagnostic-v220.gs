/**
 * MIO v2.2.0 - PURE, READ-ONLY, STAGING ONLY.
 *
 * Diagnostic for data quality BEFORE enabling an identity attestation action.
 * Takes trusted spreadsheet row arrays only; NEVER call using HTTP-provided
 * rows, and NEVER publish issues to unauthenticated clients.
 * Returns aggregate counts and 1-based sheet row numbers/error categories.
 * It intentionally does NOT return names, IDs, tokens, URLs or sheet cells.
 *
 * Requires mioIdentityAttestationV218_() in the same GAS project.
 * This is not an account-ownership proof or an automated fix.
 */
function mioIdentityDiagnosticV220_(webRows, peopleRows, attendanceRows) {
  var summary={
    registered:0,
    approved:0,
    pending:0,
    rejected:0,
    approvedConsistent:0,
    approvedNeedsReview:0,
    orphanOrInvalidWebIdRows:0
  };
  var issues=[];
  if(!Array.isArray(webRows)||!Array.isArray(peopleRows)||!Array.isArray(attendanceRows))
    return {ok:false,summary:summary,issues:[],error:'INVALID_SOURCE_ARRAYS'};
  var webIdPattern=/^MIO-W-[a-f0-9]{24}$/;
  var mioPattern=/^MIO-[0-9]{4}$/;
  var tokenPattern=/^[a-f0-9]{64}$/;
  var counts={};
  webRows.forEach(function(row){
    if(Array.isArray(row)&&webIdPattern.test(String(row[0]||''))) {
      var id=String(row[0]);
      counts[id]=(counts[id]||0)+1;
    }
  });
  webRows.forEach(function(row,index){
    if(!Array.isArray(row))return;
    var sheetRow=index+2;
    var webId=String(row[0]||'');
    var populated=row.some(function(value){return String(value==null?'':value).trim()!==''});
    if(!webIdPattern.test(webId)){
      if(populated){
        summary.orphanOrInvalidWebIdRows++;
        issues.push({sheetRow:sheetRow,codes:['ORPHAN_OR_INVALID_WEB_ID']});
      }
      return;
    }
    summary.registered++;
    var state=String(row[5]||'');
    if(state==='承認待ち'){summary.pending++;return}
    if(state==='却下'){summary.rejected++;return}
    if(state!=='承認済み'){
      issues.push({sheetRow:sheetRow,codes:['UNRECOGNIZED_APPROVAL_STATE']});
      return;
    }
    summary.approved++;
    var tokenHash=String(row[1]||'');
    var attestation=mioIdentityAttestationV218_(
      webId,tokenHash,webRows,peopleRows,attendanceRows
    );
    if(attestation.identityLinked===true&&attestation.attendanceLinked===true&&
       attestation.deviceActive===true){
      summary.approvedConsistent++;
      return;
    }
    summary.approvedNeedsReview++;
    var codes=[];
    if(counts[webId]!==1)codes.push('DUPLICATE_WEB_ID');
    if(!tokenPattern.test(tokenHash))codes.push('BAD_TOKEN_HASH');
    if(String(row[11]||'')!=='確認済み')codes.push('CONFIRMATION_NOT_COMPLETE');
    if(String(row[16]||'')!=='使用中')codes.push('DEVICE_NOT_EXPLICITLY_ACTIVE');
    var mioId=String(row[7]||'');
    if(!mioPattern.test(mioId)||String(row[10]||'')!==mioId||
       String(row[15]||'')!==mioId) codes.push('MIO_FIELDS_INCONSISTENT');
    var name=String(row[2]||'');
    var p=peopleRows.filter(function(r){return Array.isArray(r)&&String(r[0]||'')===mioId});
    var a=attendanceRows.filter(function(r){return Array.isArray(r)&&String(r[0]||'')===mioId});
    if(p.length!==1||String(p[0][1]||'')!==name)codes.push('PARTICIPANT_ROSTER_MISMATCH');
    if(a.length!==1||String(a[0][1]||'')!==name)codes.push('ATTENDANCE_ROSTER_MISMATCH');
    if(!codes.length)codes.push('UNSPECIFIED_ATTESTATION_FAILURE');
    issues.push({sheetRow:sheetRow,codes:codes});
  });
  return {ok:true,summary:summary,issues:issues};
}
