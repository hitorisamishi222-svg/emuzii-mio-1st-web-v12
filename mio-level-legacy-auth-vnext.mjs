// Additive authorization bridge for legacy MIO-W sessions.
// The GAS session remains the first authentication check. This layer applies
// vNext feature levels only after a browser has an operation-linked cutover row.
import {createHash} from 'node:crypto';
import {effectiveLevel, sameHash} from './mio-level-access-vnext.mjs';

const WEB_ID=/^MIO-W-[a-f0-9]{24}$/;
const TOKEN=/^[a-f0-9]{64}$/;
const REQUIREMENT=Object.freeze({
  site:1, public_gallery:1, attendance:2, fan_gallery:2,
  member_gallery:3, member_gacha:3
});

const denied=(reason)=>({managed:true,allowed:false,reason});

/**
 * Resolve a legacy signed cookie to a cutover-managed account.
 * A missing Web ID row means a pre-vNext legacy session; callers must set
 * gasAuthenticated only after the existing GAS bridge verified that session.
 */
export async function authorizeLegacyFeature({db,session,resource,gasAuthenticated=false,now=new Date()}){
  const required=REQUIREMENT[resource];
  if(required===undefined)return denied('UNKNOWN_RESOURCE');
  if(required===1)return {managed:false,allowed:true,reason:'PUBLIC_RESOURCE'};
  // Do not let a legacy-only row miss become a cookie-only authorization path.
  if(gasAuthenticated!==true)return denied('LEGACY_GAS_AUTH_REQUIRED');
  if(!session||typeof session.id!=='string'||!WEB_ID.test(session.id)||
     typeof session.token!=='string'||!TOKEN.test(session.token))return denied('LEGACY_SESSION_REQUIRED');

  const rows=(await db.query(`SELECT s.web_id,s.master_id,s.token_hash,s.generation,
      s.state,s.level,s.member_until,s.device_thumbprint,
      a.generation AS account_generation,a.status AS account_status,
      a.level AS account_level,a.member_until AS account_member_until
    FROM mio_level_legacy_sessions_v1 s
    JOIN mio_level_accounts_v1 a ON a.master_id=s.master_id
    WHERE s.web_id=$1`,[session.id])).rows;
  // Existing GAS-only members are grandfathered only after the GAS check above.
  if(rows.length===0)return {managed:false,allowed:true,reason:'LEGACY_GAS_ONLY'};
  if(rows.length!==1)return denied('LEGACY_IDENTITY_AMBIGUOUS');
  const row=rows[0];
  const actualHash=createHash('sha256').update(session.token).digest('hex');
  if(!sameHash(row.token_hash,actualHash))return denied('LEGACY_SESSION_MISMATCH');
  if(row.account_status==='revoked')return denied('ACCOUNT_REVOKED');

  let level;
  if(row.state==='active'){
    if(row.account_status!=='active'||Number(row.generation)!==Number(row.account_generation))
      return denied('LEGACY_SESSION_STALE');
    level=effectiveLevel({status:'active',level:Number(row.account_level),member_until:row.account_member_until},now);
  }else if(row.state==='gas_committed'){
    // GAS has switched the browser but the idempotent Neon finalize reply may
    // have been lost. Permit the verified new session while reconciliation
    // completes; the old GAS browser has already been rejected by GAS.
    if(!['active','pending'].includes(row.account_status)||
       Number(row.generation)!==Number(row.account_generation)+1)
      return denied('CUTOVER_STATE_MISMATCH');
    level=effectiveLevel({status:'active',level:Number(row.level),member_until:row.member_until},now);
  }else{
    return denied(row.state==='pending'?'CUTOVER_NOT_COMMITTED':'LEGACY_SESSION_REVOKED');
  }
  if(level<required)return denied('LEVEL_REQUIRED');
  return {managed:true,allowed:true,reason:'LEVEL_AUTHORIZED',masterId:row.master_id,level};
}

export function legacyTokenHash(token){
  if(typeof token!=='string'||!TOKEN.test(token))throw Error('INVALID_LEGACY_TOKEN');
  return createHash('sha256').update(token).digest('hex');
}
