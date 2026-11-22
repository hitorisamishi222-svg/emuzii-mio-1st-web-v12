// Admin stage API. Never sets a participant session or calls mutating GAS actions.
import {prepare,bridge} from './bridge.js';
import {hostOK,cookie,hash,pool,READY} from './gacha-passkey-auth.js';
import {releaseOK,stageReviewLink} from './review-link-core.mjs';
import {reviewLinkStore} from './review-link-store.js';
import {historicalApprovalRelease,recordHistoricalApproval} from './historical-approval-core.mjs';

async function authenticatedActor(req){
 if(process.env.MIO_GACHA_PASSKEY_RELEASE!==READY||!process.env.GALLERY_DATABASE_URL)return null;
 const t=cookie(req);if(!/^[\w-]{40,60}$/.test(t))return null;
 const p=pool();try{
  // Existing sessions have a 12h lifetime. Require a fresh (<5 minute)
  // passkey session for a new identity-link approval.
  const r=await p.query(`SELECT k.credential_id FROM mio_gacha_admin_sessions s
    JOIN mio_gacha_admin_credentials k ON k.credential_id=s.credential_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND k.revoked_at IS NULL
    AND s.expires_at>now()+interval '11 hours 55 minutes' AND s.expires_at<=now()+interval '12 hours' LIMIT 2`,[hash(t)]);
  return r.rowCount===1?'passkey:'+hash(r.rows[0].credential_id):null;
 }catch{return null}finally{await p.end()}
}
export default async function handler(req,res){
 const reply=(code,data)=>res.status(code).json(data);
 if(!prepare(req,res))return;
 if(!hostOK(req))return reply(403,{ok:false,error:'管理画面から操作してください'});
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(415,{ok:false,error:'JSONが必要です'});
 let d;try{d=typeof req.body==='string'?JSON.parse(req.body):req.body;
 if(!d||Array.isArray(d)||typeof d!=='object'||JSON.stringify(d).length>2048)throw Error('input');}catch{return reply(400,{ok:false,error:'入力を確認してください'})}
 const actor=await authenticatedActor(req);
 if(!actor)return reply(403,{ok:false,error:'管理者のFace IDを再確認してください'});
 const historicalReady=historicalApprovalRelease(process.env),linkReady=releaseOK(process.env);
 if((d.action==='record'&&!historicalReady)||(d.action==='stage'&&!linkReady)||(d.action==='status'&&!historicalReady&&!linkReady))return reply(503,{ok:false,error:'対象機能の安全確認が未完了です'});
 try{
  const store=reviewLinkStore();
  if(d.action==='status'){
   if(!/^MIO-W-[a-f0-9]{24}$/.test(d.webId||''))return reply(400,{ok:false,error:'Web参加IDが不正です'});
   const a=await store.getApproval(d.webId);
   const h=historicalReady?await store.getHistorical(d.webId):null;
   return reply(200,{ok:true,state:a?.state||(h?'historical-approved':'not-staged'),webId:d.webId,mioId:a?.mioId||h?.mioId||null,deviceLinked:a?.state==='complete'});
  }
  if(d.action==='record')return reply(200,await recordHistoricalApproval(d,{store,actor}));
  if(d.action!=='stage')return reply(400,{ok:false,error:'操作を確認してください'});
  const result=await stageReviewLink(d,{store,callGAS:bridge,actor});
  return reply(200,result);
 }catch{return reply(409,{ok:false,error:'照合未完了です。申請・台帳・操作IDを確認し、同じ操作IDで照合してください'})}
}
