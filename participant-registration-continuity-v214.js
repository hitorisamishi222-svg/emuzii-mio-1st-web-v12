/**
 * MIO v2.1.4 — STAGING ONLY: one-use registration-step-up continuation.
 * A verified bootstrap is recorded for the precise WebAuthn challenge.
 * The client never receives a separate reusable approval token.
 *
 * stage() must be called only after the trusted v210 initial step-up and
 * the v204 registration challenge are both successfully created.
 * verify() is called ONLY from trusted v211 server-side registration logic.
 * WebAuthn origin/RP/UV checks still occur in v204 before credential creation.
 */
import {createHash} from 'node:crypto';
const MIO=/^MIO-[0-9]{4}$/;
const BROWSER=/^MIO-W-[a-f0-9]{24}$/;
const HASH=/^[a-f0-9]{64}$/;
const METHODS=new Set(['approved-device-pairing','webauthn-uv']);
const sha=s=>createHash('sha256').update(s).digest('hex');
export class ContinuityDenied extends Error {
  constructor(code){super(code);this.name='ContinuityDenied';this.code=code}
}
const deny=code=>{throw new ContinuityDenied(code)};
function checkSession(session){
  if(!MIO.test(session?.mioId||'')||!BROWSER.test(session?.browserId||'')||
     !HASH.test(session?.tokenHash||'')||session?.active!==true)
    deny('CONTINUITY_SESSION_INVALID');
}
function parseChallenge(response){
  const encoded=response?.response?.clientDataJSON;
  if(typeof encoded!=='string'||encoded.length<20||encoded.length>12000||
     !/^[A-Za-z0-9_-]+$/.test(encoded))deny('CONTINUITY_RESPONSE_INVALID');
  try{
    const obj=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
    if(obj?.type!=='webauthn.create'||
       typeof obj.challenge!=='string'||obj.challenge.length<16||
       obj.challenge.length>512)deny('CONTINUITY_RESPONSE_INVALID');
    return obj.challenge;
  }catch{deny('CONTINUITY_RESPONSE_INVALID')}
}
export function createRegistrationContinuity({db}={}){
  if(typeof db?.connect!=='function')deny('CONTINUITY_DATABASE_REQUIRED');
  return Object.freeze({
    async stage({session,challenge,method}={}){
      checkSession(session);
      if(typeof challenge!=='string'||challenge.length<16||
         challenge.length>512||!METHODS.has(method))
        deny('CONTINUITY_STAGE_INVALID');
      const c=await db.connect();let inTx=false;
      try{
        await c.query('BEGIN');inTx=true;
        const r=await c.query(`UPDATE mio_passkey_challenges_v204
           SET bootstrap_verified_at=now(),bootstrap_browser_id=$4,
               bootstrap_method=$5
           WHERE mio_id=$1 AND browser_token_hash=$2 AND challenge_hash=$3
             AND purpose='register' AND used_at IS NULL AND expires_at>now()
             AND bootstrap_verified_at IS NULL
           RETURNING id`,
          [session.mioId,session.tokenHash,sha(challenge),session.browserId,method]);
        if(r.rowCount!==1)deny('CONTINUITY_STAGE_REJECTED');
        await c.query('COMMIT');inTx=false;
        return {ready:true};
      }catch(e){
        if(inTx)await c.query('ROLLBACK').catch(()=>{});
        throw e;
      }finally{c.release()}
    },
    async verify({session,response}={}){
      checkSession(session);
      const challenge=parseChallenge(response);
      const c=await db.connect();
      try{
        const r=await c.query(`SELECT bootstrap_method
           FROM mio_passkey_challenges_v204
           WHERE mio_id=$1 AND browser_token_hash=$2 AND challenge_hash=$3
             AND bootstrap_browser_id=$4 AND purpose='register'
             AND bootstrap_verified_at IS NOT NULL
             AND bootstrap_verified_at<=expires_at
             AND used_at IS NULL AND expires_at>now()
           ORDER BY id DESC LIMIT 1`,
          [session.mioId,session.tokenHash,sha(challenge),session.browserId]);
        const method=r.rows?.[0]?.bootstrap_method;
        if(r.rowCount!==1||!METHODS.has(method))
          deny('CONTINUITY_NOT_AUTHORIZED');
        return {
          mioId:session.mioId,browserId:session.browserId,
          tokenHash:session.tokenHash,userVerified:true,consumed:true,method
        };
      }finally{c.release()}
    }
  });
}
