// Framework-independent development API adapter. Not deployed as a public route.
// HTTP integration must enforce same-origin, CSRF, rate limiting, TLS and request size.
import {createAuthFlow} from './mio-auth-flow.mjs';
export function createAuthApiHandlers(pool,{flow=createAuthFlow(pool),throttle}={}){
 async function login(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.identifier!=='string'||!body.identifier.trim()||typeof body.password!=='string'||!body.password)return {status:400,body:{error:'invalid_request'}};
  if(throttle){
   if(typeof throttle.allow!=='function')throw Error('shared throttle adapter required');
   const allowed=await throttle.allow(body.identifier);
   if(!allowed)return {status:429,headers:{'Cache-Control':'no-store','Retry-After':'900'},body:{error:'too_many_attempts'}};
  }
  try{
   const result=await flow.login({identifier:body.identifier,password:body.password,deviceLabel:body.deviceLabel});
   return {status:200,headers:{'Set-Cookie':result.setCookie,'Cache-Control':'no-store'},body:{accountId:result.accountId}};
  }catch(e){
   if(e.message==='invalid credentials')return {status:401,body:{error:'invalid_credentials'}};
   throw e;
  }
 }
 async function me(cookieHeader){
  const session=await flow.current(cookieHeader);
  return {status:session?200:401,headers:{'Cache-Control':'no-store'},body:session?{accountId:session.accountId,deviceLabel:session.deviceLabel}:{error:'unauthorized'}};
 }
 async function logout(cookieHeader){
  const result=await flow.logout(cookieHeader);
  return {status:200,headers:{'Set-Cookie':result.setCookie,'Cache-Control':'no-store'},body:{ok:true}};
 }
 async function logoutAll(cookieHeader){
  const result=await flow.logoutAll(cookieHeader);
  return {status:200,headers:{'Set-Cookie':result.setCookie,'Cache-Control':'no-store'},body:{ok:true,revoked:result.revoked}};
 }
 async function devices(cookieHeader){
  const items=await flow.devices(cookieHeader);
  return {status:items?200:401,headers:{'Cache-Control':'no-store'},body:items?{devices:items}:{error:'unauthorized'}};
 }
 async function revokeDevice(cookieHeader,sessionId){
  if(typeof sessionId!=='string'||!/^[0-9a-f]{64}$/.test(sessionId))return {status:400,body:{error:'invalid_session'}};
  const revoked=await flow.revokeDevice(cookieHeader,sessionId);
  return {status:revoked===null?401:200,headers:{'Cache-Control':'no-store'},body:revoked===null?{error:'unauthorized'}:{revoked}};
 }
 return {login,me,logout,logoutAll,devices,revokeDevice};
}
