// Offline read-only adapter for Google Sheets values.get responses.
// Google omits trailing blank rows, so empty `values: []` is compatible with
// a fully scanned J1:J1000 ONLY when the returned range is exactly J1:J1000.
// Both normal and FORMULA render modes must be checked independently.
// Never logs or returns cell contents, names, tokens, or spreadsheet ID.
import {auditMigrationPlan,GRANT_TAB} from './mio-audit-schema-migration-plan.mjs';

const stop=reason=>({ok:false,status:'STOP',reason,writeAllowed:false,operations:[]});
const blank=x=>x===null||x===undefined||x==='';
function normalizeRead(read,rowCount,expectedRange){
 if(!read||read.range!==expectedRange||!Array.isArray(read.values)||
    read.values.length>rowCount)return null;
 const result=Array(rowCount).fill('');
 for(let i=0;i<read.values.length;i++){
  const row=read.values[i];
  if(!Array.isArray(row)||row.length>1)return null;
  const v=row[0];
  if(!blank(v)&&typeof v!=='string')return null;
  result[i]=blank(v)?'':v;
 }
 return result;
}
export function auditLiveSheetRead({
 sheetNames,grantHeaders,rowCapacity,columnCapacity,
 displayedRead,formulaRead,auditHeaders
}={}){
 if(!Number.isSafeInteger(rowCapacity)||rowCapacity<1||rowCapacity>50000)
   return stop('ROW_CAPACITY_UNVERIFIED');
 const target="'"+GRANT_TAB.replaceAll("'","''")+"'!J1:J"+rowCapacity;
 const displayed=normalizeRead(displayedRead,rowCapacity,target);
 if(!displayed)return stop('DISPLAYED_READ_RANGE_OR_SHAPE_INVALID');
 const formulas=normalizeRead(formulaRead,rowCapacity,target);
 if(!formulas)return stop('FORMULA_READ_RANGE_OR_SHAPE_INVALID');
 // Existing J1 may be blank or the exact approved header. Reject a
 // formula in J1 even if its displayed result is a harmless-looking header.
 // No cells in J2:Jmax may contain values OR hidden formulas.
 if(displayed[0]!==formulas[0])
   return stop('J_HEADER_VALUE_FORMULA_MISMATCH');
 if(displayed[0]!==''&&displayed[0]!=='Web操作ID')
   return stop('J_HEADER_OCCUPIED');
 if(displayed.slice(1).some(v=>v!=='')||formulas.slice(1).some(v=>v!==''))
   return stop('J_COLUMN_VALUE_OR_FORMULA_OCCUPIED');
 const plan=auditMigrationPlan({
  sheetNames,grantHeaders,jColumnValues:displayed,
  grantRowCapacity:rowCapacity,grantColumnCapacity:columnCapacity,
  ...(auditHeaders===undefined?{}:{auditHeaders})
 });
 if(!plan.ok)return plan;
 return {...plan,verifiedReadModes:['display','formula'],
   fullyReadRequestedRows:rowCapacity,writeAllowed:false};
}
