import { createSessionSecret, sessionTokenDigest } from './mio-auth-crypto.mjs';
// In-memory adapter for isolated tests only. Never use as a production session database.
export function createInMemorySessionStore({now=()=>Date.now(),ttlMs=2592000000}={}){
 const sessions=new Map();
 function create(accountId,deviceLabel){
  if(typeof accountId!=='string'||!accountId)throw Error('invalid account');
  const token=createSessionSecret(),id=sessionTokenDigest(token),createdAt=now();
  sessions.set(id,{accountId,deviceLabel:String(deviceLabel||'端末').slice(0,80),createdAt,expiresAt:createdAt+ttlMs,revokedAt:null});
  return {token,sessionId:id,expiresAt:createdAt+ttlMs};
 }
 function lookup(token){
  let id;try{id=sessionTokenDigest(token)}catch{return null}
  const s=sessions.get(id);
  return s&&s.revokedAt===null&&s.expiresAt>now()?{accountId:s.accountId,sessionId:id,deviceLabel:s.deviceLabel}:null;
 }
 function list(accountId){
  return [...sessions].filter(([,s])=>s.accountId===accountId&&s.revokedAt===null&&s.expiresAt>now()).map(([sessionId,s])=>({sessionId,deviceLabel:s.deviceLabel,createdAt:s.createdAt,expiresAt:s.expiresAt}));
 }
 function revoke(accountId,sessionId){
  const s=sessions.get(sessionId);
  if(!s||s.accountId!==accountId||s.revokedAt!==null)return false;
  s.revokedAt=now();return true;
 }
 function revokeAll(accountId){let count=0;for(const [id,s] of sessions)if(s.accountId===accountId&&revoke(accountId,id))count++;return count}
 return {create,lookup,list,revoke,revokeAll};
}
