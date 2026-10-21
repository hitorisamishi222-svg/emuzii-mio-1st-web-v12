/**
 * MIO participant WebAuthn core v2.0.4 — staging only, NO public API.
 * Distinct from gallery-admin passkeys. No privilege changes to GAS.
 *
 * All webauthn methods MUST come from @simplewebauthn/server via a
 * server-only adapter; injection here supports isolated deterministic tests.
 * The verifyBootstrap callback MUST be a trusted server-side verifier of
 * established MIO ownership, not a boolean parsed from an HTTP body.
 * An asserted IP, screen name or MIO ID is NEVER sufficient.
 */
import {createHash,randomBytes} from 'node:crypto';
const ID=/^MIO-[0-9]{4}$/;
const HASH=/^[a-f0-9]{64}$/;
const METHOD=new Set(['webauthn-uv','approved-device-pairing']);

export class PasskeyError extends Error {
  constructor(code){super(code);this.code=code;this.name='PasskeyError'}
}
const digest=s=>createHash('sha256').update(s).digest('hex');
const fail=x=>{throw new PasskeyError(x)};
function assertArgs({mioId,browserTokenHash,rpID,origin,db,webauthn}){
  if(!ID.test(mioId||''))fail('INVALID_MIO_ID');
  if(!HASH.test(browserTokenHash||''))fail('INVALID_BROWSER_CREDENTIAL');
  if(typeof rpID!=='string'||!/^[a-z0-9.-]{4,200}$/.test(rpID)||
     typeof origin!=='string'||origin!==('https://'+rpID))fail('INVALID_RP');
  if(typeof db?.connect!=='function')fail('DATABASE_REQUIRED');
  if(!webauthn)fail('WEBAUTHN_REQUIRED');
}
async function bootstrap(mioId,verifyBootstrap){
  if(typeof verifyBootstrap!=='function')fail('BOOTSTRAP_REQUIRED');
  const p=await verifyBootstrap({mioId});
  if(p?.mioId!==mioId||p.userVerified!==true||
     p.deviceApproved!==true||!METHOD.has(p.method))fail('BOOTSTRAP_REJECTED');
}
async function transaction(db,handler){
  const c=await db.connect();let tx=false;
  try{await c.query('BEGIN');tx=true;const out=await handler(c);await c.query('COMMIT');tx=false;return out}
  catch(e){if(tx)await c.query('ROLLBACK').catch(()=>{});throw e}
  finally{c.release()}
}
function responseChallenge(response){
  const encoded=response?.response?.clientDataJSON;
  if(typeof encoded!=='string'||encoded.length>12000||!encoded.length)fail('INVALID_RESPONSE');
  try{
    const data=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
    if(typeof data?.challenge!=='string'||data.challenge.length<16||data.challenge.length>512)
      fail('INVALID_RESPONSE');
    return data.challenge;
  }catch{fail('INVALID_RESPONSE')}
}
function verifiedCredential(verification){
  const c=verification?.registrationInfo?.credential;
  if(!verification?.verified||!c||typeof c.id!=='string'||
     !/^[a-zA-Z0-9_-]{12,1024}$/.test(c.id)||!c.publicKey?.length||
     !Number.isSafeInteger(c.counter)||c.counter<0)fail('REGISTRATION_NOT_VERIFIED');
  return c;
}
export async function beginParticipantPasskeyRegistration(input,context){
  const {mioId,browserTokenHash}=input;
  const {db,webauthn,rpID,origin,rpName,verifyBootstrap}=context;
  assertArgs({mioId,browserTokenHash,rpID,origin,db,webauthn});
  await bootstrap(mioId,verifyBootstrap);
  return transaction(db,async c=>{
    await c.query('INSERT INTO mio_passkey_accounts_v204(mio_id,user_handle) VALUES($1,$2) ON CONFLICT (mio_id) DO NOTHING',[mioId,randomBytes(32)]);
    const user=await c.query('SELECT user_handle FROM mio_passkey_accounts_v204 WHERE mio_id=$1',[mioId]);
    if(user.rows.length!==1)fail('ACCOUNT_NOT_READY');
    const options=await webauthn.generateRegistrationOptions({
      rpName:rpName||'翠央1周年',rpID,
      userName:'MIO participant',userDisplayName:'MIO participant',
      userID:new Uint8Array(user.rows[0].user_handle),
      attestationType:'none',timeout:90000,
      authenticatorSelection:{residentKey:'preferred',userVerification:'required'}
    });
    if(!options?.challenge||typeof options.challenge!=='string')fail('CHALLENGE_NOT_READY');
    await c.query(`INSERT INTO mio_passkey_challenges_v204(mio_id,browser_token_hash,challenge_hash,purpose,expires_at)
      VALUES($1,$2,$3,'register',now()+interval '3 minutes')`,
      [mioId,browserTokenHash,digest(options.challenge)]);
    return {options};
  });
}
export async function finishParticipantPasskeyRegistration(input,context){
  const {mioId,browserTokenHash,response}=input;
  const {db,webauthn,rpID,origin,verifyBootstrap}=context;
  assertArgs({mioId,browserTokenHash,rpID,origin,db,webauthn});
  await bootstrap(mioId,verifyBootstrap);
  const challenge=responseChallenge(response);
  return transaction(db,async c=>{
    const q=await c.query(`SELECT id FROM mio_passkey_challenges_v204
      WHERE mio_id=$1 AND browser_token_hash=$2 AND challenge_hash=$3 AND purpose='register'
       AND used_at IS NULL AND expires_at>now() ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [mioId,browserTokenHash,digest(challenge)]);
    if(q.rows.length!==1)fail('CHALLENGE_EXPIRED_OR_USED');
    let credential;
    try{
      const v=await webauthn.verifyRegistrationResponse({
        response,expectedChallenge:challenge,expectedOrigin:origin,
        expectedRPID:rpID,requireUserVerification:true
      });
      credential=verifiedCredential(v);
    }catch(e){if(e instanceof PasskeyError)throw e;fail('REGISTRATION_NOT_VERIFIED')}
    const consumed=await c.query(`UPDATE mio_passkey_challenges_v204
      SET used_at=now() WHERE id=$1 AND used_at IS NULL AND expires_at>now() RETURNING id`,[q.rows[0].id]);
    if(consumed.rowCount!==1)fail('CHALLENGE_EXPIRED_OR_USED');
    const saved=await c.query(`INSERT INTO mio_passkey_credentials_v204
      (mio_id,credential_id,public_key,sign_count,transports)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT (credential_id) DO NOTHING RETURNING credential_id`,
      [mioId,credential.id,Buffer.from(credential.publicKey),credential.counter,credential.transports||[]]);
    if(saved.rowCount!==1)fail('CREDENTIAL_ALREADY_EXISTS');
    return {registered:true,mioId};
  });
}
export async function beginParticipantPasskeyAuthentication(input,context){
  const {mioId,browserTokenHash}=input;
  const {db,webauthn,rpID,origin}=context;
  assertArgs({mioId,browserTokenHash,rpID,origin,db,webauthn});
  return transaction(db,async c=>{
    const user=await c.query('SELECT mio_id FROM mio_passkey_accounts_v204 WHERE mio_id=$1',[mioId]);
    if(user.rows.length!==1)fail('AUTHENTICATION_UNAVAILABLE');
    const options=await webauthn.generateAuthenticationOptions({rpID,userVerification:'required',timeout:90000});
    if(typeof options?.challenge!=='string')fail('CHALLENGE_NOT_READY');
    await c.query(`INSERT INTO mio_passkey_challenges_v204(mio_id,browser_token_hash,challenge_hash,purpose,expires_at)
      VALUES($1,$2,$3,'authenticate',now()+interval '3 minutes')`,
      [mioId,browserTokenHash,digest(options.challenge)]);
    return {options};
  });
}
export async function finishParticipantPasskeyAuthentication(input,context){
  const {mioId,browserTokenHash,response}=input;
  const {db,webauthn,rpID,origin}=context;
  assertArgs({mioId,browserTokenHash,rpID,origin,db,webauthn});
  const challenge=responseChallenge(response);
  return transaction(db,async c=>{
    const q=await c.query(`SELECT id FROM mio_passkey_challenges_v204
      WHERE mio_id=$1 AND browser_token_hash=$2 AND challenge_hash=$3 AND purpose='authenticate'
      AND used_at IS NULL AND expires_at>now() ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [mioId,browserTokenHash,digest(challenge)]);
    if(q.rows.length!==1)fail('CHALLENGE_EXPIRED_OR_USED');
    const credentialId=response?.id;
    if(typeof credentialId!=='string'||credentialId.length>1024)fail('INVALID_RESPONSE');
    const data=await c.query(`SELECT credential_id,public_key,sign_count,transports
      FROM mio_passkey_credentials_v204
      WHERE mio_id=$1 AND credential_id=$2 AND revoked_at IS NULL FOR UPDATE`,[mioId,credentialId]);
    if(data.rows.length!==1)fail('CREDENTIAL_NOT_FOUND');
    const row=data.rows[0];let verification;
    try{
      verification=await webauthn.verifyAuthenticationResponse({
        response,expectedChallenge:challenge,expectedOrigin:origin,
        expectedRPID:rpID,requireUserVerification:true,
        credential:{id:row.credential_id,publicKey:new Uint8Array(row.public_key),
          counter:Number(row.sign_count),transports:row.transports||[]}
      });
    }catch{fail('AUTHENTICATION_NOT_VERIFIED')}
    if(!verification?.verified||
      !Number.isSafeInteger(verification.authenticationInfo?.newCounter)||
      verification.authenticationInfo.newCounter<0)fail('AUTHENTICATION_NOT_VERIFIED');
    const used=await c.query(`UPDATE mio_passkey_challenges_v204 SET used_at=now()
       WHERE id=$1 AND used_at IS NULL AND expires_at>now() RETURNING id`,[q.rows[0].id]);
    if(used.rowCount!==1)fail('CHALLENGE_EXPIRED_OR_USED');
    await c.query(`UPDATE mio_passkey_credentials_v204
      SET sign_count=GREATEST(sign_count,$1),last_used_at=now()
      WHERE mio_id=$2 AND credential_id=$3`,[verification.authenticationInfo.newCounter,mioId,credentialId]);
    // Trusted internal proof ONLY. Never JSON serialize to a public client.
    return {mioId,userVerified:true,challengeConsumed:true,method:'webauthn-uv'};
  });
}
