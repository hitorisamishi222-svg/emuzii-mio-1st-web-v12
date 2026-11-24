import {createHash,createHmac} from 'node:crypto';
export const TARGET=Object.freeze({webId:'MIO-W-b502544b66bbb759c52114d1',mioId:'MIO-0017',name:'ユーリ'});
const sha256=s=>createHash('sha256').update(s).digest('hex');
export function credentialsFromCode(code){
 if(typeof code!=='string'||!/^MIO-REC-[a-f0-9]{32}$/.test(code))throw Error('INVALID_RECOVERY_CODE');
 const codeHash=sha256('MIO:YURI:RECOVERY:v1:'+code);
 const token=createHmac('sha256','MIO:YURI:SESSION:v1').update(code).digest('hex');
 return {codeHash,token,tokenHash:sha256(token)};
}
export function assertVerifiedStatus(d){
 const g=d?.progress?.gacha;
 if(d?.ok!==true||d.participantId!==TARGET.webId||d.name!==TARGET.name||
    d.status!=='承認済み'||d.progress==null||
    typeof d.progress.attendanceAchieved!=='boolean'||
    g?.confirmed!==true||Number(g.total)!==2||
    !Number.isSafeInteger(Number(g.remaining))||Number(g.remaining)<0||Number(g.remaining)>2||
    !Number.isSafeInteger(Number(g.used))||Number(g.used)<0||
    Number(g.remaining)+Number(g.used)!==2)
   throw Error('GAS_ENTITLEMENT_UNVERIFIED');
 return {remaining:Number(g.remaining),total:2,used:Number(g.used)};
}
