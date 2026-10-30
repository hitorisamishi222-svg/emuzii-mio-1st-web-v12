/**
 * MIO admin-confirmed two-browser recovery. No recovery URL or user input.
 * Requires an existing valid, signed mio_light_session cookie and Neon proof.
 * GAS checks the exact two browser identifiers against administrator-approved
 * master identities and leaves all original credentials/history unchanged.
 * The sole release flag is MIO_AUTO_RECOVER_VERIFIED_TWO=enabled.
 */
import {readLightSession} from './registration-light-session.js';
import {statusV201} from './registration-name-v201.js';
import {hash,bridge,sessionCookie} from './bridge.js';

const TARGETS=Object.freeze({
  'MIO-W-e1a31c322e98578b68f9b31c':Object.freeze({masterId:'MIO-0010',name:'まーくん💎🐳ྀི🎃🎁✨️',allowReviewed:false}),
  'MIO-W-741785c3fb78c7be6f0bbbd3':Object.freeze({masterId:'MIO-0018',name:'サスケ',allowReviewed:true}),
  'MIO-W-1b85de069bf677d2affca3c5':Object.freeze({masterId:'MIO-0003',name:'えむじー🐱',allowReviewed:true,gasAlreadyApproved:true}),
  'MIO-W-e56d635f98eaca299d52b4ba':Object.freeze({masterId:'MIO-0047',name:'かんちゃん💖2次審査通過thx✨️',allowReviewed:false,gasAlreadyApproved:true})
});

export async function recoverFromAdminApprovedLightCookie({req,res,config,dependencies={}}){
  if(config?.MIO_AUTO_RECOVER_VERIFIED_TWO!=='enabled')return {status:'disabled'};
  const readLight=dependencies.readLightSession||readLightSession;
  const getLight=dependencies.statusV201||statusV201;
  const digest=dependencies.hash||hash;
  const callGAS=dependencies.bridge||bridge;
  const signSession=dependencies.sessionCookie||sessionCookie;
  const session=readLight(req.headers.cookie,config.MIO_LIGHT_SESSION_SECRET);
  if(!session)return {status:'no-light-cookie'};
  const approved=TARGETS[session.id];
  if(!approved)return {status:'not-approved-browser'};
  if(!/^[a-f0-9]{64}$/.test(String(session.token||'')))return {status:'invalid-light-token'};
  const tokenHash=digest(session.token);
  let light;
  try{light=await getLight(session.id,tokenHash)}catch{return {status:'neon-proof-failed'}}
  if(!light||light.ok!==true||light.participantId!==session.id||light.name!==approved.name)
    return {status:'neon-identity-mismatch'};
  if(light.pendingReview){
    if(!approved.allowReviewed)return {status:'neon-review-not-approved'};
  }else if(light.pendingReview!==false||light.status!=='承認済み'||
      light.attendanceGrantVerified!==true||light.integratedParticipantId!==approved.masterId){
    return {status:'neon-approval-mismatch'};
  }
  // Only this admin-confirmed device already has an independently verified
  // approved GAS row. The signed light cookie and exact GAS tokenHash must
  // both match; never grant a session from a name, Neon review, or IP alone.
  if(approved.gasAlreadyApproved){
    const identity={participantId:session.id,tokenHash};
    let status;
    try{status=await callGAS('status',identity)}
    catch{return {status:'gas-unavailable'}}
    if(!status||status.ok!==true||status.participantId!==session.id||
       status.status!=='承認済み'||status.name!==approved.name||
       !status.progress||!Array.isArray(status.progress.attendanceConfirmedDays)||
       !Array.isArray(status.progress.attendanceLockedDays))
       return {status:'gas-status-failed'};
    if(typeof config.APPS_SCRIPT_SECRET!=='string'||config.APPS_SCRIPT_SECRET.length<32)
       return {status:'missing-session-secret'};
    res.setHeader('Set-Cookie',signSession(session.id,session.token,config.APPS_SCRIPT_SECRET));
    return {status:'recovered',data:status};
  }
  // Do not re-register by name: v1.9.6 deliberately marks duplicates pending.
  // This separate GAS action is guarded by an exact two-browser allowlist,
  // a verified original approved row, the GAS bridge secret, and a script lock.
  const identity={participantId:session.id,tokenHash};
  let linked,status;
  try{
    linked=await callGAS('mioAdminVerifiedTwoBrowser',{...identity,masterId:approved.masterId});
    if(linked?.ok!==true||linked.verified!==true||linked.participantId!==session.id||
       linked.integratedParticipantId!==approved.masterId||linked.status!=='承認済み'||
       typeof linked.legacyName!=='string'||!linked.legacyName)return {status:'gas-admin-link-failed'};
    status=await callGAS('status',identity);
  }catch{return {status:'gas-unavailable'}}
  if(!status||status.ok!==true||status.participantId!==session.id||
     status.status!=='承認済み'||status.name!==linked.legacyName||
     !status.progress||!Array.isArray(status.progress.attendanceConfirmedDays)||
     !Array.isArray(status.progress.attendanceLockedDays))return {status:'gas-status-failed'};
  if(typeof config.APPS_SCRIPT_SECRET!=='string'||config.APPS_SCRIPT_SECRET.length<32)
    return {status:'missing-session-secret'};
  res.setHeader('Set-Cookie',signSession(session.id,session.token,config.APPS_SCRIPT_SECRET));
  return {status:'recovered',data:status};
}
