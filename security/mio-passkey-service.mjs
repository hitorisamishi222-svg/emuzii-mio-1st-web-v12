// TEST-only WebAuthn service. No biometric data or private keys are stored.
import {randomUUID} from 'node:crypto';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {createPostgresSessionStore} from './mio-postgres-session-store.mjs';
import {makeSessionCookie} from './mio-session-cookie.mjs';

export function createPasskeyService(pool,{origin,rpID,sessions=createPostgresSessionStore(pool),now=()=>Date.now()}={}){
 if(!pool||typeof pool.query!=='function')throw Error('pg-compatible pool required');
 const parsed=new URL(origin||'');
 if(parsed.protocol!=='https:'||parsed.hostname!==rpID)throw Error('exact HTTPS origin and RP ID required');
 const rpName='みおシステム';
 async function currentAccount(cookieHeader,flow){
  const session=await flow.current(cookieHeader);
  return session?.accountId||null;
 }
 async function registrationOptions(accountId){
  if(typeof accountId!=='string')return {status:401,body:{error:'unauthorized'}};
  const account=await pool.query('SELECT account_id,mio_id FROM mio_accounts_v21 WHERE account_id=$1',[accountId]);
  if(!account.rowCount)return {status:401,body:{error:'unauthorized'}};
  const existing=await pool.query('SELECT credential_id,transports FROM mio_passkey_credentials WHERE account_id=$1',[accountId]);
  const options=await generateRegistrationOptions({
   rpName,rpID,userID:Buffer.from(accountId.replaceAll('-',''),'hex'),
   userName:account.rows[0].mio_id,userDisplayName:'みおシステム会員',
   attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},
   excludeCredentials:existing.rows.map(x=>({id:x.credential_id,transports:x.transports||[]})),
  });
  const id=randomUUID();
  await pool.query('INSERT INTO mio_passkey_challenges(challenge_id,account_id,challenge,ceremony,expires_at) VALUES($1,$2,$3,$4,$5)',
   [id,accountId,options.challenge,'registration',new Date(now()+300000)]);
  return {status:200,body:{challengeId:id,options}};
 }
 async function verifyRegistration(accountId,body){
  if(!accountId)return {status:401,body:{error:'unauthorized'}};
  const id=body?.challengeId;
  if(typeof id!=='string')return {status:400,body:{error:'invalid_request'}};
  const r=await pool.query("DELETE FROM mio_passkey_challenges WHERE challenge_id=$1 AND account_id=$2 AND ceremony='registration' AND expires_at>now() RETURNING challenge",[id,accountId]);
  if(!r.rowCount)return {status:400,body:{error:'challenge_expired'}};
  try{
   const verification=await verifyRegistrationResponse({response:body.response,expectedChallenge:r.rows[0].challenge,
    expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
   if(!verification.verified||!verification.registrationInfo)return {status:400,body:{error:'verification_failed'}};
   const info=verification.registrationInfo,cred=info.credential;
   await pool.query('INSERT INTO mio_passkey_credentials(credential_id,account_id,public_key,sign_count,transports,device_type,backed_up) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [cred.id,accountId,Buffer.from(cred.publicKey),cred.counter,body.response?.response?.transports||[],info.credentialDeviceType,info.credentialBackedUp]);
   return {status:200,body:{ok:true}};
  }catch(e){if(e?.code==='23505')return {status:409,body:{error:'credential_already_registered'}};return {status:400,body:{error:'verification_failed'}}}
 }
 async function authenticationOptions(identifier){
  if(typeof identifier!=='string'||!identifier.trim()||identifier.length>100)return {status:400,body:{error:'invalid_request'}};
  const account=await pool.query('SELECT a.account_id FROM mio_accounts_v21 a JOIN mio_identifiers_v21 i ON i.account_id=a.account_id WHERE i.identifier_key=lower($1)',[identifier.trim()]);
  if(!account.rowCount)return {status:401,body:{error:'invalid_credentials'}};
  const accountId=account.rows[0].account_id;
  const creds=await pool.query('SELECT credential_id,transports FROM mio_passkey_credentials WHERE account_id=$1',[accountId]);
  if(!creds.rowCount)return {status:401,body:{error:'passkey_unavailable'}};
  const options=await generateAuthenticationOptions({rpID,userVerification:'required',
   allowCredentials:creds.rows.map(x=>({id:x.credential_id,transports:x.transports||[]}))});
  const id=randomUUID();
  await pool.query('INSERT INTO mio_passkey_challenges(challenge_id,account_id,challenge,ceremony,expires_at) VALUES($1,$2,$3,$4,$5)',
   [id,accountId,options.challenge,'authentication',new Date(now()+300000)]);
  return {status:200,body:{challengeId:id,options}};
 }
 async function verifyAuthentication(body,deviceLabel='端末'){
  const id=body?.challengeId;
  if(typeof id!=='string')return {status:400,body:{error:'invalid_request'}};
  const ch=await pool.query("DELETE FROM mio_passkey_challenges WHERE challenge_id=$1 AND ceremony='authentication' AND expires_at>now() RETURNING challenge,account_id",[id]);
  if(!ch.rowCount)return {status:400,body:{error:'challenge_expired'}};
  const accountId=ch.rows[0].account_id,credentialId=body.response?.id;
  const found=await pool.query('SELECT credential_id,public_key,sign_count,transports FROM mio_passkey_credentials WHERE account_id=$1 AND credential_id=$2',[accountId,credentialId]);
  if(!found.rowCount)return {status:401,body:{error:'invalid_credentials'}};
  try{
   const c=found.rows[0];
   const verification=await verifyAuthenticationResponse({response:body.response,expectedChallenge:ch.rows[0].challenge,
    expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
    credential:{id:c.credential_id,publicKey:new Uint8Array(c.public_key),counter:Number(c.sign_count),transports:c.transports||[]}});
   if(!verification.verified)return {status:401,body:{error:'invalid_credentials'}};
   const update=await pool.query('UPDATE mio_passkey_credentials SET sign_count=$1,last_used_at=now() WHERE credential_id=$2 AND sign_count=$3',
    [verification.authenticationInfo.newCounter,c.credential_id,c.sign_count]);
   if(!update.rowCount)return {status:401,body:{error:'invalid_credentials'}};
   const session=await sessions.create(accountId,deviceLabel);
   return {status:200,headers:{'Set-Cookie':makeSessionCookie(session.token),'Cache-Control':'no-store'},body:{ok:true,accountId}};
  }catch{return {status:401,body:{error:'invalid_credentials'}}}
 }
 async function count(accountId){const r=await pool.query('SELECT count(*)::int AS count FROM mio_passkey_credentials WHERE account_id=$1',[accountId]);return r.rows[0].count}
 return {registrationOptions,verifyRegistration,authenticationOptions,verifyAuthentication,count,currentAccount};
}
