// DRY RUN ONLY. This module never writes to a spreadsheet or calls Google APIs.
// Uses *only* existing sheet names, the 9 safe header strings, and occupancy
// metadata for the J column. It cannot observe or output participant details.
// A plan is NOT authorization to mutate production. Obtain separate approval.
export const GRANT_HEADERS=Object.freeze([
 '日時','参加者ID','ColorSing名','付与回数','付与理由',
 '変更前特別付与','変更後特別付与','変更後総権利','変更後残り'
]);
export const AUDIT_HEADERS=Object.freeze([
 '日時','操作ID','操作種別','Web参加ID','MIO-ID','変更前',
 '変更後','処理状態','備考','対象名'
]);
export const GRANT_TAB='emuzii_ガチャ付与履歴';
export const AUDIT_TAB='emuzii_Web管理操作履歴';

const stop=reason=>({ok:false,status:'STOP',reason,writeAllowed:false,operations:[]});
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
const blank=v=>v===null||v===undefined||v==='';
// sheetNames from metadata, grantHeaders from A1:I1, J1:Jmax read-only.
export function auditMigrationPlan({
 sheetNames,grantHeaders,jColumnValues,grantRowCapacity,
 grantColumnCapacity,auditHeaders
}={}){
 if(!Array.isArray(sheetNames)||sheetNames.length<1||
    sheetNames.some(x=>typeof x!=='string'||!x)||
    new Set(sheetNames).size!==sheetNames.length)
   return stop('SHEET_NAMES_UNTRUSTED');
 if(sheetNames.filter(x=>x===GRANT_TAB).length!==1)return stop('GRANT_TAB_MISSING');
 if(!same(grantHeaders,GRANT_HEADERS))return stop('GRANT_HEADERS_CHANGED');
 if(!Number.isSafeInteger(grantRowCapacity)||grantRowCapacity<1||
    grantRowCapacity>50000||!Number.isSafeInteger(grantColumnCapacity)||
    grantColumnCapacity<10)return stop('GRANT_GRID_UNVERIFIED');
 if(!Array.isArray(jColumnValues)||jColumnValues.length!==grantRowCapacity||
    jColumnValues.some(v=>typeof v!=='string'&&!blank(v)))
   return stop('J_COLUMN_NOT_FULLY_SCANNED');
 const hasAudit=sheetNames.includes(AUDIT_TAB);
 if(hasAudit&&!same(auditHeaders,AUDIT_HEADERS))return stop('AUDIT_TAB_EXISTS_UNEXPECTED');
 if(!hasAudit&&auditHeaders!==undefined)return stop('AUDIT_TAB_STATUS_CONFLICT');
 const header=jColumnValues[0];
 if(!blank(header)&&header!=='Web操作ID')return stop('J_HEADER_OCCUPIED');
 if(jColumnValues.slice(1).some(v=>!blank(v)))return stop('J_DATA_OCCUPIED');
 const operations=[];
 if(!hasAudit)operations.push({
  type:'CREATE_AUDIT_TAB',title:AUDIT_TAB,
  headerCount:AUDIT_HEADERS.length,headings:[...AUDIT_HEADERS]
 });
 if(blank(header))operations.push({type:'SET_GRANT_J1',tab:GRANT_TAB,cell:'J1',value:'Web操作ID'});
 return {
  ok:true,status:operations.length?'AWAITING_EXPLICIT_SCHEMA_APPROVAL':'ALREADY_READY',
  writeAllowed:false,operations,
  verifiedExistingGrantHeaders:true,verifiedJRowCount:grantRowCapacity,
  existingGrantHistoryProtected:true
 };
}
