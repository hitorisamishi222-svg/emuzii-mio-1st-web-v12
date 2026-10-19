import {enroll,statusForBrowser,checkRegistrationV2Connection} from './registration-v2-store.js';
import {hash,readSession,sessionCookie} from './bridge.js';
import {identityFromRetryKey} from './registration-attempt.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='feat/registration-v2-independent-core-20261019')return res.status(503).json({ok:false});
 const key=process.env.MIO_REGISTRATION_PREVIEW_SIGNING_KEY;
 if(!key||key.length<32||!process.env.MIO_REGISTRATION_DATABASE_URL)return res.status(503).json({ok:false});
 if(req.method==='GET'){
  try{return res.status(200).json({ok:true,mode:'v2-preview',databaseReady:await checkRegistrationV2Connection()})}
  catch{return res.status(503).json({ok:false,mode:'v2-preview',databaseReady:false})}
 }
 if(req.method!=='POST')return res.status(405).json({ok:false});
 const origin=req.headers.origin;
 if(origin){try{if(new URL(origin).host!==req.headers.host)throw Error()}catch{return res.status(403).json({ok:false})}}
 try{
  if(req.body?.action==='status'){
   const s=readSession(req.headers.cookie,key);
   if(!s)return res.status(401).json({ok:false});
   return res.status(200).json(await statusForBrowser(s.id,hash(s.token)));
  }
  if(req.body?.action!=='register')return res.status(400).json({ok:false});
  const {name,loginId='',retryKey,retryIssuedAt}=req.body;
  if(typeof name!=='string'||typeof loginId!=='string')return res.status(400).json({ok:false});
  if(readSession(req.headers.cookie,key))return res.status(409).json({ok:false});
  const id=identityFromRetryKey(retryKey,key,retryIssuedAt);
  if(!id)return res.status(409).json({ok:false,error:'retry key invalid'});
  const d=await enroll({browserId:id.id,tokenHash:hash(id.token),name,loginId});
  res.setHeader('Set-Cookie',sessionCookie(id.id,id.token,key));
  return res.status(d.created?201:200).json(d);
 }catch(e){return res.status(502).json({ok:false,error:'registration not confirmed'})}
}
