// OFFLINE/READ ONLY: aggregate gacha and browser-register statuses from two
// existing Google Sheet ranges, without copying participant names or identifiers.
// Web: emuzii_Web登録!F2:Q<max> (columns F..Q, never tokenHash).
// Gacha: emuzii_ガチャ!A2:O<max> (15-column records).
// "single candidate" is NOT definitive identity or permission to draw/grant.
const idPattern=/^MIO-\d{4}$/;
const safeInt=value=>{
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:null;
 if(typeof value==='string'&&/^\d{1,12}$/.test(value.trim())){
  const n=Number(value);return Number.isSafeInteger(n)?n:null;
 }
 return null;
};
const failure=reason=>({ok:false,status:'STOP',reason,writeAllowed:false});
export function reconcileGachaBrowserLinks({webRows,gachaRows}={}){
 if(!Array.isArray(webRows)||!Array.isArray(gachaRows)||
    webRows.length>1000||gachaRows.length>500)return failure('INPUT_SHAPE');
 const linked=new Map();
 for(const row of webRows){
  if(!Array.isArray(row)||row.length>12)return failure('WEB_ROW_SHAPE');
  // Missing MIO ID is an unlinked Web record, not a matching record.
  const id=String(row[2]??'').trim();
  if(!idPattern.test(id))continue;
  const consistent=row[5]===id&&(row[10]==null||row[10]===''||row[10]===id);
  const approved=row[0]==='承認済み'&&row[6]==='確認済み'&&row[11]!=='旧端末';
  if(approved&&consistent)linked.set(id,(linked.get(id)||0)+1);
 }
 const seen=new Set();
 const counts={gachaRows:0,positiveChecked:0,singleCandidate:0,noCandidate:0,multipleCandidates:0,creditsNeedReview:0,zeroBalance:0};
 for(const row of gachaRows){
  if(!Array.isArray(row)||row.length>15)return failure('GACHA_ROW_SHAPE');
  const id=String(row[0]??'').trim();
  if(!idPattern.test(id))continue;
  if(seen.has(id))return failure('DUPLICATE_GACHA_ID');
  seen.add(id);counts.gachaRows++;
  const remaining=safeInt(row[7]);
  if(remaining===0){counts.zeroBalance++;continue;}
  const total=safeInt(row[5]),special=safeInt(row[14]);
  if(remaining===null||total===null||remaining>total||special===null||
    row[12]!=='OK'||row[13]!=='OK'){counts.creditsNeedReview++;continue;}
  counts.positiveChecked++;
  const candidates=linked.get(id)||0;
  if(candidates===1)counts.singleCandidate++;
  else if(candidates===0)counts.noCandidate++;
  else counts.multipleCandidates++;
 }
 return {ok:true,status:'READ_ONLY_PRELIMINARY',writeAllowed:false,
  personIdentityVerified:false,drawAuthorization:false,counts};
}
