// Framework-independent development API adapter. Not deployed as a public route.
// HTTP integration must enforce same-origin, CSRF, rate limiting, TLS and request size.
import {createAuthFlow} from './mio-auth-flow.mjs';
export function createAuthApiHandlers(pool,{flow=createAuthFlow(pool)}={}){
 async function login(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return {status:400,body:{error:'invalid_request'}};
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
 return {login,me,logout,logoutAll};
}
