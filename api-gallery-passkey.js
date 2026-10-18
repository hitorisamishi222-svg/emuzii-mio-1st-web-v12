import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
const { Pool } = pg;
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';

/*
 * Gallery-only admin authentication. No participant/MIO-ID authority is accepted.
 * Owner invitations are inserted by an authorized operator into the isolated gallery DB.
 * A passkey alone never approves a new browser: the HttpOnly device cookie must match
 * an explicitly approved server-side device entry.
 */
const b64 = b => Buffer.from(b).toString('base64url');
const digest = s => createHash('sha256').update(s).digest('hex');
const fresh = () => b64(randomBytes(32));
const uuidOk = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const readCookie = (req,name) => {
 const part=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='));
 return part?decodeURIComponent(part.slice(name.length+1)):null;
};
const COOKIE_OPTS='HttpOnly; Secure; SameSite=Strict; Path=/api/gallery';
const setCookie=(res,name,value,age)=>res.setHeader('Set-Cookie',[...(res.getHeader('Set-Cookie')||[]),name+'='+encodeURIComponent(value)+'; '+COOKIE_OPTS+'; Max-Age='+age]);
const error=(res,status,code)=>res.status(status).json({ok:false,code});
const deviceToken = (req,res) => {
 let v=readCookie(req,'mio_gallery_device');
 if(!v||! /^[A-Za-z0-9_-]{40,60}$/.test(v)){v=fresh();setCookie(res,'mio_gallery_device',v,31536000)}
 return v;
};
const extractChallenge=response=>{
 const data=response?.response?.clientDataJSON;
 if(typeof data!=='string'||data.length>12000)throw Error('Invalid credential');
 const parsed=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
 if(typeof parsed.challenge!=='string'||parsed.challenge.length>512)throw Error('Invalid challenge');
 return parsed.challenge;
};
const checkInvite=async(c,invite)=>{
 if(typeof invite!=='string'||! /^[A-Za-z0-9_-]{40,100}$/.test(invite))return false;
 const row=await c.query('SELECT token_hash FROM gallery_admin_owner_invites WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > now() LIMIT 1',[digest(invite)]);
 return row.rowCount===1;
};
const session=async(c,req)=>{
 const token=readCookie(req,'mio_gallery_session'),device=readCookie(req,'mio_gallery_device');
 if(!token||!device)return null;
 const r=await c.query(`SELECT u.id, u.role, d.id AS device_id FROM gallery_admin_sessions s
 JOIN gallery_admin_users u ON u.id=s.user_id JOIN gallery_admin_devices d ON d.id=s.device_id
 WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL
 AND u.status='active' AND d.user_id=u.id AND d.device_public_id=$2 AND d.status='approved' LIMIT 1`,[digest(token),digest(device)]);
 return r.rows[0]||null;
};
const startOwner=async(c,req,res,host,body)=>{
 if(!await checkInvite(c,body.invite))return error(res,403,'INVITE_INVALID_OR_EXPIRED');
 const hasOwner=await c.query("SELECT id,status FROM gallery_admin_users WHERE role='owner' LIMIT 1");
 if(hasOwner.rows[0]?.status==='active')return error(res,409,'OWNER_ALREADY_REGISTERED');
 let id=hasOwner.rows[0]?.id;
 if(!id){
   const r=await c.query("INSERT INTO gallery_admin_users(display_name,role,status) VALUES('えむじー🐱','owner','pending') ON CONFLICT DO NOTHING RETURNING id");
   id=r.rows[0]?.id;
   if(!id){const o=await c.query("SELECT id,status FROM gallery_admin_users WHERE role='owner' LIMIT 1");if(o.rows[0]?.status!=='pending')return error(res,409,'OWNER_ALREADY_REGISTERED');id=o.rows[0].id;}
 }
 const dev=deviceToken(req,res);
 const options=await generateRegistrationOptions({
  rpName:'翠央1周年 ギャラリー',rpID:host,userName:'gallery-owner',
  userDisplayName:'えむじー🐱',userID:Buffer.from(id.replace(/-/g,''),'hex'),
  attestationType:'none',timeout:90000,
  authenticatorSelection:{residentKey:'required',userVerification:'required'}
 });
 await c.query("INSERT INTO gallery_admin_challenges(user_id,challenge_hash,purpose,device_hash,expires_at) VALUES($1,$2,'register',$3,now()+interval '3 minutes')",[id,digest(options.challenge),digest(dev)]);
 return res.status(200).json({ok:true,options});
};
const finishOwner=async(c,req,res,host,body)=>{
 if(!await checkInvite(c,body.invite))return error(res,403,'INVITE_INVALID_OR_EXPIRED');
 const dev=readCookie(req,'mio_gallery_device');
 if(!dev)return error(res,403,'DEVICE_COOKIE_MISSING');
 let challenge;
 try{challenge=extractChallenge(body.credential)}catch{return error(res,400,'CREDENTIAL_INVALID')}
 const q=await c.query(`SELECT ch.id, ch.user_id FROM gallery_admin_challenges ch
 JOIN gallery_admin_users u ON u.id=ch.user_id WHERE ch.challenge_hash=$1 AND ch.purpose='register'
 AND ch.device_hash=$2 AND ch.used_at IS NULL AND ch.expires_at>now() AND u.role='owner' AND u.status='pending'
 ORDER BY ch.created_at DESC LIMIT 1`,[digest(challenge),digest(dev)]);
 if(!q.rowCount)return error(res,403,'CHALLENGE_EXPIRED_OR_INVALID');
 let verification;
 try{verification=await verifyRegistrationResponse({response:body.credential,expectedChallenge:challenge,expectedOrigin:'https://'+host,expectedRPID:host,requireUserVerification:true})}
 catch{return error(res,400,'PASSKEY_VERIFICATION_FAILED')}
 if(!verification.verified||!verification.registrationInfo)return error(res,400,'PASSKEY_VERIFICATION_FAILED');
 const cred=verification.registrationInfo.credential;
 const tok=fresh();
 try{
 await c.query('BEGIN');
 const used=await c.query("UPDATE gallery_admin_owner_invites SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING token_hash",[digest(body.invite)]);
 const chall=await c.query("UPDATE gallery_admin_challenges SET used_at=now() WHERE id=$1 AND used_at IS NULL AND expires_at>now() RETURNING id",[q.rows[0].id]);
 const owner=await c.query("UPDATE gallery_admin_users SET status='active' WHERE id=$1 AND status='pending' RETURNING id",[q.rows[0].user_id]);
 if(!used.rowCount||!chall.rowCount||!owner.rowCount)throw Error('Bootstrap already used');
 await c.query("INSERT INTO gallery_admin_passkeys(credential_id,user_id,public_key,sign_count,transports) VALUES($1,$2,$3,$4,$5)",[cred.id,owner.rows[0].id,Buffer.from(cred.publicKey),cred.counter,cred.transports||[]]);
 const d=await c.query("INSERT INTO gallery_admin_devices(user_id,device_public_id,status,approved_by,approved_at) VALUES($1,$2,'approved',$1,now()) RETURNING id",[owner.rows[0].id,digest(dev)]);
 await c.query("INSERT INTO gallery_admin_sessions(user_id,device_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",[owner.rows[0].id,d.rows[0].id,digest(tok)]);
 await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,'owner_passkey_registration',$2,'success')",[owner.rows[0].id,d.rows[0].id]);
 await c.query('COMMIT');
 }catch(err){await c.query('ROLLBACK');return error(res,409,'REGISTRATION_CONFLICT')}
 setCookie(res,'mio_gallery_session',tok,43200);
 return res.status(200).json({ok:true,registered:true,deviceApproved:true});
};
const startLogin=async(c,req,res,host)=>{
 const dev=deviceToken(req,res);
 const options=await generateAuthenticationOptions({rpID:host,userVerification:'required',timeout:90000});
 await c.query("INSERT INTO gallery_admin_challenges(challenge_hash,purpose,device_hash,expires_at) VALUES($1,'authenticate',$2,now()+interval '3 minutes')",[digest(options.challenge),digest(dev)]);
 return res.status(200).json({ok:true,options});
};
const finishLogin=async(c,req,res,host,body)=>{
 const dev=readCookie(req,'mio_gallery_device');
 if(!dev)return error(res,403,'DEVICE_COOKIE_MISSING');
 let challenge;
 try{challenge=extractChallenge(body.credential)}catch{return error(res,400,'CREDENTIAL_INVALID')}
 const ch=await c.query("SELECT id FROM gallery_admin_challenges WHERE challenge_hash=$1 AND purpose='authenticate' AND device_hash=$2 AND used_at IS NULL AND expires_at>now() LIMIT 1",[digest(challenge),digest(dev)]);
 if(!ch.rowCount)return error(res,403,'CHALLENGE_EXPIRED_OR_INVALID');
 const p=await c.query(`SELECT p.credential_id,p.public_key,p.sign_count,p.transports,u.id AS user_id FROM gallery_admin_passkeys p
 JOIN gallery_admin_users u ON u.id=p.user_id WHERE p.credential_id=$1 AND p.revoked_at IS NULL AND u.status='active' LIMIT 1`,[body.credential?.id||'']);
 if(!p.rowCount)return error(res,403,'PASSKEY_NOT_RECOGNIZED');
 const k=p.rows[0];
 let verification;
 try{verification=await verifyAuthenticationResponse({response:body.credential,expectedChallenge:challenge,expectedOrigin:'https://'+host,expectedRPID:host,requireUserVerification:true,credential:{id:k.credential_id,publicKey:new Uint8Array(k.public_key),counter:Number(k.sign_count),transports:k.transports||[]}})}
 catch{return error(res,400,'PASSKEY_VERIFICATION_FAILED')}
 if(!verification.verified)return error(res,400,'PASSKEY_VERIFICATION_FAILED');
 const tok=fresh();
 let approved=false;
 try{
 await c.query('BEGIN');
 const used=await c.query("UPDATE gallery_admin_challenges SET used_at=now() WHERE id=$1 AND used_at IS NULL AND expires_at>now() RETURNING id",[ch.rows[0].id]);
 if(!used.rowCount)throw Error('Challenge reused');
 await c.query("UPDATE gallery_admin_passkeys SET sign_count=GREATEST(sign_count,$1) WHERE credential_id=$2",[verification.authenticationInfo.newCounter,k.credential_id]);
 const d=await c.query(`INSERT INTO gallery_admin_devices(user_id,device_public_id,status) VALUES($1,$2,'pending')
 ON CONFLICT (user_id,device_public_id) DO UPDATE SET device_public_id=EXCLUDED.device_public_id RETURNING id,status`,[k.user_id,digest(dev)]);
 approved=d.rows[0].status==='approved';
 if(approved){await c.query("INSERT INTO gallery_admin_sessions(user_id,device_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",[k.user_id,d.rows[0].id,digest(tok)]);}
 await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,'passkey_login',$2,$3)",[k.user_id,d.rows[0].id,approved?'approved':'device_pending']);
 await c.query('COMMIT');
 }catch{await c.query('ROLLBACK');return error(res,409,'LOGIN_CONFLICT')}
 if(approved)setCookie(res,'mio_gallery_session',tok,43200);
 return res.status(200).json({ok:true,passkeyVerified:true,deviceApproved:approved,approvalPending:!approved});
};
const getDevices=async(c,req,res)=>{
 const s=await session(c,req);if(!s||s.role!=='owner')return error(res,403,'OWNER_APPROVAL_REQUIRED');
 const r=await c.query("SELECT id,status,created_at,approved_at FROM gallery_admin_devices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[s.id]);
 return res.status(200).json({ok:true,devices:r.rows,authorizedDevice:s.device_id});
};
const approveDevice=async(c,req,res,body)=>{
 const s=await session(c,req);if(!s||s.role!=='owner')return error(res,403,'OWNER_APPROVAL_REQUIRED');
 if(!uuidOk(body.deviceId)||body.deviceId===s.device_id)return error(res,400,'INVALID_DEVICE');
 try{
  await c.query('BEGIN');
  const d=await c.query("UPDATE gallery_admin_devices SET status='approved',approved_by=$1,approved_at=now() WHERE id=$2 AND user_id=$1 AND status='pending' RETURNING id",[s.id,body.deviceId]);
  if(!d.rowCount){await c.query('ROLLBACK');return error(res,404,'DEVICE_NOT_PENDING')}
  await c.query("INSERT INTO gallery_admin_audit(actor_id,action,target,result) VALUES($1,'device_approved',$2,'success')",[s.id,body.deviceId]);
  await c.query('COMMIT');
  return res.status(200).json({ok:true,deviceApproved:true});
 }catch{await c.query('ROLLBACK');return error(res,500,'APPROVAL_FAILED')}
};
export default async function handler(req,res){
 // Dedicated gallery-admin passkey authentication; participant MIO-ID is not accepted.
 // Keep this change on the review branch until end-to-end device tests pass.
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Vary','Cookie');
 const host=(req.headers.host||'').toLowerCase();
 const productionHost='emuzii-mio-1st-web-v12.vercel.app';
 const previewHost=(process.env.GALLERY_PASSKEY_PREVIEW_HOST||'').toLowerCase();
 const previewAllowed=process.env.VERCEL_ENV==='preview'
  && process.env.VERCEL_GIT_COMMIT_REF==='fix/announcements-passkey-auth-review'
  && /^emuzii-mio-1st-web-v12-[a-z0-9-]+\.vercel\.app$/.test(previewHost)
  && host===previewHost;
 if(host!==productionHost&&!previewAllowed)return error(res,403,'ORIGIN_NOT_ALLOWED');
 if(!process.env.GALLERY_DATABASE_URL)return error(res,503,'ADMIN_AUTH_NOT_CONFIGURED');
 const action=req.method==='GET'?'status':req.body?.action;
 if(req.method!=='GET'&&req.method!=='POST'){res.setHeader('Allow','GET, POST');return error(res,405,'METHOD_NOT_ALLOWED')}
 if(req.method==='POST'){
  if(req.headers.origin!=='https://'+host||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return error(res,403,'REQUEST_ORIGIN_INVALID');
  if(Number(req.headers['content-length']||0)>150000)return error(res,413,'BODY_TOO_LARGE');
 }
 const pool=new Pool({connectionString:process.env.GALLERY_DATABASE_URL,max:1});
 let c;
 try{
  c=await pool.connect();
  if(action==='status'){
   const auth=await session(c,req);
   return res.status(200).json({ok:true,configured:true,authenticated:!!auth,role:auth?.role||null});
  }
  if(action==='registerOptions'&&req.method==='POST')return await startOwner(c,req,res,host,req.body);
  if(action==='registerVerify'&&req.method==='POST')return await finishOwner(c,req,res,host,req.body);
  if(action==='loginOptions'&&req.method==='POST')return await startLogin(c,req,res,host);
  if(action==='loginVerify'&&req.method==='POST')return await finishLogin(c,req,res,host,req.body);
  if(action==='devices'&&req.method==='POST')return await getDevices(c,req,res);
  if(action==='approveDevice'&&req.method==='POST')return await approveDevice(c,req,res,req.body);
  return error(res,400,'ACTION_NOT_SUPPORTED');
 }catch(e){console.error('gallery auth:',e?.message||'unknown');return error(res,503,'AUTH_SERVICE_UNAVAILABLE')}
 finally{c?.release();await pool.end()}
}
