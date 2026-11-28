// Isolated MIO admin recovery selection: server-verified GAS data only.
import {safeName,validMaster,validLevel,LEVEL} from './mio-level-access-vnext.mjs';

export function verifiedRosterTarget(roster,masterId,displayName) {
 const id=validMaster(masterId),name=safeName(displayName);
 if(!Array.isArray(roster))throw Error('ROSTER_UNAVAILABLE');
 const matching=roster.filter(x=>x&&x.mioId===id);
 if(matching.length!==1||safeName(matching[0].name)!==name||
    matching[0].needsReview===true)
  throw Error('ROSTER_IDENTITY_REVIEW_REQUIRED');
 return {source:'gas-verified',unique:true,masterId:id,displayName:name};
}
export function verifiedMembershipEvidence({level,masterId,approvedBrowsers,memberUntil,confirmed,now=new Date()}) {
 validLevel(level);
 if(level!==LEVEL.MEMBER)return {memberEvidence:null,memberUntil:null};
 if(confirmed!==true||!Array.isArray(approvedBrowsers))throw Error('MEMBERSHIP_OWNER_CONFIRMATION_REQUIRED');
 const matches=approvedBrowsers.filter(x=>x?.mioId===masterId&&x?.verified===true&&x.member==='確認済み');
 if(matches.length===0)throw Error('MEMBERSHIP_RECORD_UNVERIFIED');
 const until=new Date(memberUntil);
 if(!Number.isFinite(until.getTime())||until<=now)throw Error('MEMBERSHIP_EXPIRY_REQUIRED');
 return {memberEvidence:{source:'server-owner-verified',active:true},memberUntil:until.toISOString()};
}
export function ownerOperationInput(request) {
 if(!request||request.action!=='issue'||request.operatorConfirmed!==true)
  throw Error('OWNER_CONFIRMATION_REQUIRED');
 const masterId=validMaster(request.masterId);
 const displayName=safeName(request.displayName);
 const level=validLevel(request.level);
 if(typeof request.operationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(request.operationId))
  throw Error('INVALID_OPERATION_ID');
 return {masterId,displayName,level,operationId:request.operationId};
}
export function restrictedRosterView(roster) {
 if(!Array.isArray(roster))throw Error('ROSTER_UNAVAILABLE');
 return roster.filter(x=>x&&typeof x.mioId==='string'&&/^MIO-[0-9]{4}$/.test(x.mioId)&&
    typeof x.name==='string'&&!x.needsReview).slice(0,300)
  .map(x=>({mioId:x.mioId,name:x.name}));
}
