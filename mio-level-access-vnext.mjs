// MIO three-level registration vNext: isolated policy only.
// Existing production GAS participant, attendance and gacha records are the source of truth.
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export const LEVEL=Object.freeze({PUBLIC:1,FAN:2,MEMBER:3});
export const RESOURCE=Object.freeze({
 SITE:'site',PUBLIC_GALLERY:'public_gallery',ATTENDANCE:'attendance',
 FAN_GALLERY:'fan_gallery',MEMBER_GALLERY:'member_gallery',MEMBER_GACHA:'member_gacha'
});
const REQUIREMENT=Object.freeze({
 [RESOURCE.SITE]:LEVEL.PUBLIC,[RESOURCE.PUBLIC_GALLERY]:LEVEL.PUBLIC,
 [RESOURCE.ATTENDANCE]:LEVEL.FAN,[RESOURCE.FAN_GALLERY]:LEVEL.FAN,
 [RESOURCE.MEMBER_GALLERY]:LEVEL.MEMBER,[RESOURCE.MEMBER_GACHA]:LEVEL.MEMBER
});
const MASTER_ID=/^MIO-(?:[0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$/;
const REDEEM_CODE=/^MIO-ACCESS-[a-f0-9]{40}$/; // 160 random bits
const FINGERPRINT=/^sha256:[a-f0-9]{64}$/;
const SESSION=/^[a-f0-9]{64}$/;
export function safeName(value){
 if(typeof value!=='string')throw Error('NAME_REQUIRED');
 const name=value.normalize('NFKC').trim().replace(/\s+/gu,' ');
 if(!name||name.length>80||/[\u0000-\u001f\u007f]/u.test(name))throw Error('INVALID_NAME');
 return name;
}
export function validMaster(id){
 if(typeof id!=='string'||!MASTER_ID.test(id))throw Error('TRUSTED_MASTER_ID_REQUIRED');
 return id;
}
export function validLevel(level){
 if(!Number.isInteger(level)||level<1||level>3)throw Error('INVALID_LEVEL');
 return level;
}
export function issuerOwned(actor,issuer){
 if(!actor||actor.source!=='server-session'||actor.role!=='owner'||!actor.userId||
    !issuer||issuer.active!==true||issuer.owner_user_id!==actor.userId)throw Error('OWNER_AUTH_REQUIRED');
 return true;
}
export function trustedRosterBinding(proof,id,name){
 // Construct this ONLY after a fresh read of authoritative GAS/roster records.
 // Matching nicknames and user-submitted flags are never sufficient.
 if(!proof||proof.source!=='gas-verified'||proof.unique!==true||
    proof.masterId!==id||safeName(proof.displayName)!==name)
  throw Error('VERIFIED_ROSTER_BINDING_REQUIRED');
 return true;
}
export function verifiedMemberGrant(level,until,ownerEvidence,now=new Date()){
 validLevel(level);
 if(level!==LEVEL.MEMBER)return null;
 const expires=new Date(until);
 if(ownerEvidence?.source!=='server-owner-verified'||ownerEvidence?.active!==true||
    !Number.isFinite(expires.getTime())||expires<=now)throw Error('MEMBERSHIP_VERIFICATION_REQUIRED');
 return expires;
}
export function effectiveLevel(account,now=new Date()){
 if(account?.status!=='active')return LEVEL.PUBLIC;
 const level=validLevel(account.level);
 if(level===LEVEL.MEMBER&&(!account.member_until||new Date(account.member_until)<=now))return LEVEL.FAN;
 return level;
}
export function canUse(account,resource,now=new Date()){
 const min=REQUIREMENT[resource];
 if(min===undefined)return false;
 return effectiveLevel(account,now)>=min;
}
export function authorizedFeature({account,resource,sessionValid,deviceProofVerified,now=new Date()}){
 if(REQUIREMENT[resource]===LEVEL.PUBLIC)return true;
 return sessionValid===true&&deviceProofVerified===true&&canUse(account,resource,now);
}
function hmac(value,pepper){
 if(typeof pepper!=='string'||pepper.length<48)throw Error('ACCESS_PEPPER_REQUIRED');
 return createHmac('sha256',pepper).update(value).digest('hex');
}
export function issueCode(pepper){
 const code='MIO-ACCESS-'+randomBytes(20).toString('hex');
 return {code,codeHash:hmac('access-code:'+code,pepper)};
}
export function codeDigest(code,pepper){
 if(typeof code!=='string'||!REDEEM_CODE.test(code))throw Error('INVALID_ACCESS_CODE');
 return hmac('access-code:'+code,pepper);
}
export function newSession(pepper){
 const token=randomBytes(32).toString('hex');
 return {token,sessionHash:hmac('access-session:'+token,pepper)};
}
export function sessionDigest(token,pepper){
 if(typeof token!=='string'||!SESSION.test(token))throw Error('INVALID_SESSION');
 return hmac('access-session:'+token,pepper);
}
export function sameHash(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 const aa=Buffer.from(a),bb=Buffer.from(b);
 return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export function verifiedDevice(proof){
 if(!proof||proof.source!=='server-verified-signature'||proof.fresh!==true||
    typeof proof.fingerprint!=='string'||!FINGERPRINT.test(proof.fingerprint))
  throw Error('DEVICE_SIGNATURE_REQUIRED');
 return proof.fingerprint;
}
