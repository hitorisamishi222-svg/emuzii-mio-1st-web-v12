import {createPostgresLoginService} from './mio-postgres-login.mjs';
import {createPostgresSessionStore} from './mio-postgres-session-store.mjs';
import {makeSessionCookie,expireSessionCookie,readSessionCookie} from './mio-session-cookie.mjs';
import {sessionTokenDigest} from './mio-auth-crypto.mjs';
// Development-only service; production HTTP handlers must add CSRF and rate limits.
export function createAuthFlow(pool,{sessions=createPostgresSessionStore(pool)}={}){
 const passwords=createPostgresLoginService(pool,{sessions});
 async function login(credentials){
  const result=await passwords.login(credentials);
  return {accountId:result.accountId,sessionId:result.sessionId,setCookie:makeSessionCookie(result.token)};
 }
 async function current(header){
  const token=readSessionCookie(header);
  return token?await sessions.lookup(token):null;
 }
 async function logout(header){
  const token=readSessionCookie(header);
  if(token){
   const active=await sessions.lookup(token);
   if(active)await sessions.revoke(active.accountId,sessionTokenDigest(token));
  }
  return {setCookie:expireSessionCookie()};
 }
 async function logoutAll(header){
  const active=await current(header);
  const revoked=active?await sessions.revokeAll(active.accountId):0;
  return {revoked,setCookie:expireSessionCookie()};
 }
 async function devices(header){
  const active=await current(header);
  if(!active)return null;
  return sessions.list(active.accountId);
 }
 async function revokeDevice(header,sessionId){
  const active=await current(header);
  if(!active)return null;
  return sessions.revoke(active.accountId,sessionId);
 }
 return {login,current,logout,logoutAll,devices,revokeDevice};
}
