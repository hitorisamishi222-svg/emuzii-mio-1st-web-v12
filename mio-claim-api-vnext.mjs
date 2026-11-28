import {createChallengeService,bindingForClaim} from './mio-device-challenge-vnext.mjs';
import {createHmac} from 'node:crypto';
export function createClaimApi({db,claimIssuedAccess,activatePendingAccess,store,limiter,origin,pepper,enabled=false,clock=Date.now,allowLoopbackTest=false}) {
 if(typeof pepper!=='string'||pepper.length<48||typeof claimIssuedAccess!=='function'||typeof activatePendingAccess!=='function'||!limiter?.allow)throw Error('CONFIG_REQUIRED');
 const challenges=createChallengeService({store,origin,clock});
 const key=(type,value)=>createHmac('sha256',pepper).update(type+':'+value).digest('hex');
 const reply=(status,body,cookie)=>({status,body,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Type':'application/json',...(cookie?{'Set-Cookie':cookie}:{})}});
 const activeCookie=allowLoopbackTest?'mio_test_session':'__Host-mio_vnext_session';
 const pendingCookie=allowLoopbackTest?'mio_test_pending':'__Host-mio_vnext_pending';
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; ${allowLoopbackTest?'':'Secure; '}HttpOnly; SameSite=Strict; Max-Age=${age}`;
 const cookieValue=(header,name)=>{
  const item=String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  const value=item?.slice(name.length+1)||'';
  return /^[a-f0-9]{64}$/.test(value)?value:null;
 };
 return async function handle({method,requestOrigin,contentType,body,clientId,cookies=''}){
  if(!enabled)return reply(503,{ok:false,error:'UNAVAILABLE'});
  if(method!=='POST'||requestOrigin!==origin||!/^application\/json(?:\s*;|$)/i.test(contentType||''))return reply(403,{ok:false,error:'REQUEST_REJECTED'});
  if(typeof clientId!=='string'||!clientId||clientId.length>200)return reply(503,{ok:false,error:'UNAVAILABLE'});
  if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{ok:false,error:'INVALID_REQUEST'});
  try{
   if(!await limiter.allow(key('client',clientId),30,600000))return reply(429,{ok:false,error:'TRY_LATER'});
   const {name,code,action}=body;
   const binding=bindingForClaim(name,code);
   if(action==='challenge'){
    if(!await limiter.allow(key('challenge',code),10,600000))return reply(429,{ok:false,error:'TRY_LATER'});
    return reply(200,{ok:true,...await challenges.issue({binding,publicJwk:body.publicJwk})});
   }
   if(!['claim','activate'].includes(action))return reply(400,{ok:false,error:'INVALID_REQUEST'});
   if(!await limiter.allow(key(action,code),8,600000))return reply(429,{ok:false,error:'TRY_LATER'});
   const proof=await challenges.consume({id:body.id,binding,signature:body.signature});
   if(action==='activate'){
    const pendingToken=cookieValue(cookies,pendingCookie);
    if(!pendingToken)return reply(401,{ok:false,error:'PENDING_SESSION_REQUIRED'});
    const active=await activatePendingAccess({db,displayName:name,code,sessionToken:pendingToken,deviceProof:proof,pepper,now:new Date(clock())});
    if(!/^MIO-(?:[0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$/.test(active.masterId))throw Error('INVALID_RESULT');
    return reply(200,{ok:true,masterId:active.masterId},[
     cookie(activeCookie,pendingToken,2592000),cookie(pendingCookie,'',0)
    ]);
   }
   const result=await claimIssuedAccess({db,displayName:name,code,deviceProof:proof,deviceInfo:{browser:String(body.browser||'unknown').slice(0,40),os:String(body.os||'unknown').slice(0,40)},pepper,now:new Date(clock())});
   if(!/^[a-f0-9]{64}$/.test(result.sessionToken)||!/^MIO-(?:[0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$/.test(result.masterId))throw Error('INVALID_RESULT');
   if(result.state==='active')return reply(200,{ok:true,masterId:result.masterId},[
    cookie(activeCookie,result.sessionToken,2592000),cookie(pendingCookie,'',0)
   ]);
   return reply(200,{ok:true,stage:'pending',masterId:result.masterId},cookie(pendingCookie,result.sessionToken,1800));
  }catch{return reply(400,{ok:false,error:'REGISTRATION_FAILED'});}
 };
}
// Durable adapters: query-only pool interface; use an isolated schema/database first.
export function pgChallengeStore(db){return {
 async put(r){await db.query('INSERT INTO mio_level_challenges_v1(id,record,expires_at) VALUES($1,$2,to_timestamp($3/1000.0))',[r.id,JSON.stringify(r),r.expiresAt]);},
 async take(id){return (await db.query('DELETE FROM mio_level_challenges_v1 WHERE id=$1 RETURNING record',[id])).rows[0]?.record;},
 async cleanup(){await db.query('DELETE FROM mio_level_challenges_v1 WHERE expires_at<=now()');}
};}
export function pgLimiter(db,clock=Date.now){return {
 async allow(key,max,windowMs){const bucket=Math.floor(clock()/windowMs);const r=await db.query('INSERT INTO mio_level_rate_v1(rate_key,bucket,hits,expires_at) VALUES($1,$2,1,to_timestamp($3/1000.0)) ON CONFLICT(rate_key,bucket) DO UPDATE SET hits=mio_level_rate_v1.hits+1 WHERE mio_level_rate_v1.hits<$4 RETURNING hits',[key,bucket,(bucket+2)*windowMs,max]);return r.rows.length===1;},
 async cleanup(){await db.query('DELETE FROM mio_level_rate_v1 WHERE expires_at<=now()');}
};}
