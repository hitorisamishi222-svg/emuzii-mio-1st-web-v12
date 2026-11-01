// Manual intake for a lost browser with NO cookies. Does not grant login.
import {randomBytes,createHash} from 'node:crypto';
export const RELEASE='reviewed-cookie-loss-intake-20261031';
export const enabled=(env=process.env)=>env.MIO_COOKIE_LOSS_INTAKE_RELEASE===RELEASE;
export const COOKIE='__Host-mio_lost_device_case';
const WEB=/^MIO-W-[a-f0-9]{24}$/;
const MIO=/^MIO-[0-9]{4}$/;
const CASE=/^[0-9a-f-]{36}$/i;
const OP=/^[a-f0-9]{32}$/;
const STATES=['submitted','reviewing','manual_verification_required','closed'];
const BROWSERS=['safari','chrome','line','x','other','unknown'];
export const cookieValue=()=>randomBytes(32).toString('hex');
export const cookieHash=token=>createHash('sha256').update('mio-cookie-loss-v1:'+token).digest('hex');
export const validToken=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);
export function cookieHeader(token){
 if(!validToken(token))throw Error('invalid session');
 return COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400';
}
export function readCookie(raw){
 const match=String(raw||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 const token=match?.slice(COOKIE.length+1)||'';
 return validToken(token)?token:null;
}
export function sanitizeIntake(data){
 if(!data||typeof data!=='object')throw Error('missing intake');
 const name=typeof data.name==='string'?data.name.trim():'';
 const mioId=typeof data.mioId==='string'?data.mioId.trim().toUpperCase():'';
 if(name.length<1||name.length>40||/[\x00-\x1f<>]/.test(name))throw Error('invalid display name');
 if(mioId&&!MIO.test(mioId))throw Error('invalid claimed MIO ID');
 if(!BROWSERS.includes(data.previousBrowser))throw Error('unknown browser');
 if(Object.keys(data).some(k=>!['name','mioId','previousBrowser'].includes(k)))throw Error('unexpected fields');
 return {name,mioId,previousBrowser:data.previousBrowser};
}
export async function submitIntake(db,data,token){
 const fields=sanitizeIntake(data);
 if(!validToken(token))throw Error('invalid browser session');
 const result=await db.query(`INSERT INTO mio_cookie_loss_cases
  (request_id,browser_proof_hash,claimed_name,claimed_mio_id,previous_browser,
   state,expires_at)
  VALUES (gen_random_uuid(),$1,$2,$3,$4,'submitted',now()+interval '24 hours')
  ON CONFLICT (browser_proof_hash) DO NOTHING
  RETURNING request_id`,
  [cookieHash(token),fields.name,fields.mioId||null,fields.previousBrowser]);
 if(result.rowCount!==1)throw Error('browser request already submitted');
 return {ok:true,status:'submitted'};
}
export async function caseStatus(db,token){
 if(!validToken(token))return {ok:true,status:'none'};
 const r=await db.query(`SELECT state FROM mio_cookie_loss_cases
 WHERE browser_proof_hash=$1 AND expires_at>now()
 ORDER BY requested_at DESC LIMIT 1`,[cookieHash(token)]);
 return {ok:true,status:STATES.includes(r.rows[0]?.state)?r.rows[0].state:'none'};
}
export async function listCases(db){
 const r=await db.query(`SELECT request_id,claimed_name,claimed_mio_id,
  previous_browser,state,requested_at,expires_at
 FROM mio_cookie_loss_cases
 WHERE expires_at>now() AND state<>'closed'
 ORDER BY requested_at DESC LIMIT 50`);
 return (r.rows||[]).map(x=>({
  requestId:x.request_id,name:x.claimed_name,claimedMioId:x.claimed_mio_id||'',
  previousBrowser:x.previous_browser,state:x.state,requestedAt:x.requested_at,
  expiresAt:x.expires_at,identityVerified:false,loginEnabled:false
 }));
}
export async function changeCase(db,data,actor){
 if(!data||!CASE.test(data.requestId||'')||!OP.test(data.operationId||'')||
   !['reviewing','manual_verification_required','closed'].includes(data.nextState)||
   !['submitted','reviewing','manual_verification_required'].includes(data.expectedState)||
   !['admin-code','admin-passkey'].includes(actor))throw Error('invalid review');
 const d=data;
 await db.query('BEGIN');
 try{
  const r=await db.query(`SELECT state,review_operation_id,review_transition
   FROM mio_cookie_loss_cases WHERE request_id=$1 FOR UPDATE`,[d.requestId]);
  if(r.rowCount!==1)throw Error('case missing');
  const x=r.rows[0];
  const transition=d.expectedState+'>'+d.nextState;
  if(x.review_operation_id===d.operationId&&x.review_transition===transition){
   await db.query('COMMIT');return {status:d.nextState,replayed:true};
  }
  if(x.state!==d.expectedState)throw Error('state changed');
  // Save a new immutable action in an independent audit; no login credentials ever.
  const prev=await db.query(`SELECT request_id,transition FROM mio_cookie_loss_audit
    WHERE operation_id=$1`,[d.operationId]);
  if(prev.rowCount)throw Error('operation conflict');
  const u=await db.query(`UPDATE mio_cookie_loss_cases
    SET state=$2,review_operation_id=$3,review_transition=$4,
     reviewed_at=now()
    WHERE request_id=$1 AND state=$5 AND expires_at>now()
    RETURNING request_id`,[d.requestId,d.nextState,d.operationId,transition,d.expectedState]);
  if(u.rowCount!==1)throw Error('expired or modified');
  await db.query(`INSERT INTO mio_cookie_loss_audit
    (operation_id,request_id,actor,transition)
    VALUES($1,$2,$3,$4)`,[d.operationId,d.requestId,actor,transition]);
  await db.query('COMMIT');
  return {status:d.nextState,replayed:false};
 }catch(e){await db.query('ROLLBACK');throw e}
}
export const isClaimedMioId=x=>MIO.test(x||'');
export const isWebId=x=>WEB.test(x||'');
