
import {randomBytes} from 'node:crypto';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {HOST,READY,COOKIE,hash,random,hostOK,cookie,pool,sessionOK} from './gacha-passkey-auth.js';
import {authorizedCode} from './api-gacha-web-gate.js';
const deny=(res,status,error)=>res.status(status).json({ok:false,error});
const opts='HttpOnly; Secure; SameSite=Strict; Path=/api/';
function setCookie(res,name,value,age){
 const current=res.getHeader('Set-Cookie')||[];
 res.setHeader('Set-Cookie',[...(Array.isArray(current)?current:[current]),name+'='+encodeURIComponent(value)+'; '+opts+'; Max-Age='+age]);
}
function device(req,res){
 let value=cookie(req,'mio_gacha_pk_device');
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(value)){value=random();setCookie(res,'mio_gacha_pk_device',value,31536000);}
 return value;
}
function challengeOf(response){
 const s=response?.response?.clientDataJSON;
 if(typeof s!=='string'||s.length>12000)throw Error('invalid credential');
 const c=JSON.parse(Buffer.from(s,'base64url').toString('utf8'));
 if(typeof c.challenge!=='string'||c.challenge.length>512)throw Error('invalid challenge');
 return c.challenge;
}
async function rememberChallenge(c,challenge,kind,deviceID){
 const recent=await c.query("SELECT count(*)::int AS n FROM mio_gacha_admin_challenges WHERE device_hash=$1 AND created_at > now()-interval '1 minute'",[hash(deviceID)]);
 if(Number(recent.rows[0]?.n||0)>=6)throw Error('too many attempts');
 await c.query("INSERT INTO mio_gacha_admin_challenges(challenge_hash,device_hash,kind,expires_at) VALUES($1,$2,$3,now()+interval '3 minutes')",
 [hash(challenge),hash(deviceID),kind]);
}
async function getChallenge(c,response,kind,deviceID){
 const value=challengeOf(response);
 const q=await c.query("SELECT id FROM mio_gacha_admin_challenges WHERE challenge_hash=$1 AND device_hash=$2 AND kind=$3 AND consumed_at IS NULL AND expires_at>now() LIMIT 1",[hash(value),hash(deviceID),kind]);
 if(q.rowCount!==1)throw Error('challenge invalid');
 return {value,id:q.rows[0].id};
}
async function consumeChallenge(c,id){
 const q=await c.query("UPDATE mio_gacha_admin_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING id",[id]);
 if(q.rowCount!==1)throw Error('challenge reused');
}
async function createSession(c,credentialID,res){
 const token=random();
 await c.query("INSERT INTO mio_gacha_admin_sessions(token_hash,credential_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",[hash(token),credentialID]);
 setCookie(res,COOKIE,token,43200);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'||!hostOK(req)||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
   return deny(res,403,'操作元を確認してください');
 if(process.env.MIO_GACHA_PASSKEY_RELEASE!==READY||!process.env.GALLERY_DATABASE_URL)
   return deny(res,503,'Face IDの接続準備中です');
 if(Number(req.headers['content-length']||0)>18000)return deny(res,413,'認証データが大きすぎます');
 const d=req.body;
 if(!d||typeof d!=='object'||Array.isArray(d))return deny(res,400,'入力を確認してください');
 if(!['status','registerOptions','registerVerify','loginOptions','loginVerify','logout'].includes(d.action))
   return deny(res,400,'未対応の操作です');
 const registering=d.action==='registerOptions'||d.action==='registerVerify';
 if(registering&&!authorizedCode(d.code,process.env.MIO_GACHA_WEB_KEY_SHA256))
   return deny(res,403,'管理者コードを確認してください');
 if(d.action==='status')return res.status(200).json({ok:true,authenticated:await sessionOK(req)});
 const db=pool();
 try{
  const c=await db.connect();
  try{
   if(d.action==='logout'){
    const token=cookie(req);
    if(token)await c.query('UPDATE mio_gacha_admin_sessions SET revoked_at=now() WHERE token_hash=$1',[hash(token)]);
    setCookie(res,COOKIE,'',0);
    return res.status(200).json({ok:true,authenticated:false});
   }
   const dev=device(req,res);
   if(d.action==='registerOptions'){
    const previous=await c.query('SELECT credential_id,transports FROM mio_gacha_admin_credentials WHERE revoked_at IS NULL LIMIT 80');
    // A shared operator code may bootstrap two administrators.
    // Adding more credentials requires an already authenticated administrator.
    if(previous.rowCount>=2&&!(await sessionOK(req)))
      return deny(res,403,'追加のFace ID登録には登録済み端末での認証が必要です');
    if(previous.rowCount>=20)return deny(res,409,'登録数の上限です');
    const options=await generateRegistrationOptions({
     rpName:'みおガチャ Web管理',rpID:HOST,userName:'mio-admin',
     userDisplayName:'みおガチャ管理者',
     userID:new Uint8Array(randomBytes(16)),
     attestationType:'none',timeout:90000,
     authenticatorSelection:{residentKey:'preferred',userVerification:'required'},
     excludeCredentials:previous.rows.map(x=>({id:x.credential_id,transports:x.transports||[]}))
    });
    await rememberChallenge(c,options.challenge,'register',dev);
    return res.status(200).json({ok:true,options});
   }
   if(d.action==='loginOptions'){
    const registered=await c.query('SELECT credential_id,transports FROM mio_gacha_admin_credentials WHERE revoked_at IS NULL LIMIT 80');
    if(registered.rowCount===0)return deny(res,409,'Face IDを先に登録してください');
    const options=await generateAuthenticationOptions({rpID:HOST,userVerification:'required',timeout:90000,
      allowCredentials:registered.rows.map(x=>({id:x.credential_id,transports:x.transports||[]}))});
    await rememberChallenge(c,options.challenge,'login',dev);
    return res.status(200).json({ok:true,options});
   }
   if(d.action==='registerVerify'){
    const existing=await c.query('SELECT count(*)::int AS n FROM mio_gacha_admin_credentials WHERE revoked_at IS NULL');
    if(Number(existing.rows[0]?.n||0)>=2&&!(await sessionOK(req)))
      return deny(res,403,'追加登録には既存管理者の認証が必要です');
    if(Number(existing.rows[0]?.n||0)>=20)return deny(res,409,'登録上限に達しました');
    const ch=await getChallenge(c,d.credential,'register',dev);
    const v=await verifyRegistrationResponse({response:d.credential,expectedChallenge:ch.value,
      expectedOrigin:'https://'+HOST,expectedRPID:HOST,requireUserVerification:true});
    if(!v.verified||!v.registrationInfo?.credential)return deny(res,403,'Face IDの登録を確認できません');
    const k=v.registrationInfo.credential;
    await c.query('BEGIN');
    try{
     await consumeChallenge(c,ch.id);
     await c.query('INSERT INTO mio_gacha_admin_credentials(credential_id,public_key,sign_count,transports) VALUES($1,$2,$3,$4)',
      [k.id,Buffer.from(k.publicKey),k.counter,k.transports||[]]);
     await createSession(c,k.id,res);
     await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e}
    return res.status(200).json({ok:true,registered:true,authenticated:true});
   }
   if(d.action==='loginVerify'){
    const ch=await getChallenge(c,d.credential,'login',dev);
    const id=d.credential?.id;
    if(typeof id!=='string'||id.length>1000)return deny(res,400,'パスキーIDが不正です');
    const ks=await c.query('SELECT credential_id,public_key,sign_count,transports FROM mio_gacha_admin_credentials WHERE credential_id=$1 AND revoked_at IS NULL LIMIT 1',[id]);
    if(ks.rowCount!==1)return deny(res,403,'登録済みのパスキーではありません');
    const k=ks.rows[0];
    const v=await verifyAuthenticationResponse({response:d.credential,expectedChallenge:ch.value,
      expectedOrigin:'https://'+HOST,expectedRPID:HOST,requireUserVerification:true,
      credential:{id:k.credential_id,publicKey:new Uint8Array(k.public_key),counter:Number(k.sign_count),transports:k.transports||[]}});
    if(!v.verified)return deny(res,403,'Face IDの認証を確認できません');
    await c.query('BEGIN');
    try{
     await consumeChallenge(c,ch.id);
     await c.query('UPDATE mio_gacha_admin_credentials SET sign_count=GREATEST(sign_count,$1) WHERE credential_id=$2',
      [v.authenticationInfo.newCounter,k.credential_id]);
     await createSession(c,k.credential_id,res);
     await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e}
    return res.status(200).json({ok:true,authenticated:true});
   }
  }finally{c.release()}
 }catch(e){
  console.error('MIO gacha passkey operation failed',d.action,e?.code||e?.name||'unknown');
  return deny(res,409,'Face IDの認証を完了できません。必要なら管理者コードで入ってください');
 }finally{await db.end()}
}
