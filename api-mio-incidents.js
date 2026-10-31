// Admin-only incident inbox. Feature flagged until existing database migration is reviewed.
import pg from 'pg';
import {prepare} from './bridge.js';
import {authorizedCode} from './api-gacha-web-gate.js';
import {sessionOK} from './gacha-passkey-auth.js';
import {enabled,canTriage,listIncidents,transitionIncident,normalizeTriage} from './mio-incident-core.js';

const SITE='emuzii-mio-1st-web-v12.vercel.app';
const reply=(res,http,code,error)=>res.status(http).json({ok:false,code,error});
let instance=null;
function pool(){
 if(!instance)instance=new pg.Pool({connectionString:process.env.GALLERY_DATABASE_URL,
   max:2,connectionTimeoutMillis:1200,query_timeout:2000,statement_timeout:2000,
   idleTimeoutMillis:1000});
 return instance;
}
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==SITE||req.headers.origin!=='https://'+SITE)
   return reply(res,403,'ORIGIN_INVALID','管理画面から操作してください');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
   return reply(res,415,'INVALID_FORMAT','操作形式を確認してください');
 if(Number(req.headers['content-length']||0)>1400)
   return reply(res,413,'PAYLOAD_TOO_LARGE','入力が長すぎます');
 let data;
 try{data=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return reply(res,400,'INVALID_JSON','入力を確認してください')}
 if(!data||typeof data!=='object'||Array.isArray(data))
   return reply(res,400,'INVALID_BODY','操作内容を確認してください');
 const codeOK=authorizedCode(data.code,process.env.MIO_GACHA_WEB_KEY_SHA256);
 const passkeyOK=codeOK?false:await sessionOK(req);
 if(!codeOK&&!passkeyOK)return reply(res,403,'ADMIN_REQUIRED','管理者コードまたはFace IDで認証してください');
 if(!enabled())return reply(res,503,'INCIDENT_CENTER_DISABLED','障害管理の接続準備中です');
 if(!process.env.GALLERY_DATABASE_URL)return reply(res,503,'INCIDENT_DB_UNAVAILABLE','障害管理台帳が未接続です');
 if(data.action==='read'){
  try{
   const items=await listIncidents((sql,args)=>pool().query(sql,args));
   const counts=(await pool().query(
    "SELECT state,count(*)::integer AS count FROM mio_admin_incidents GROUP BY state",[])).rows;
   return res.status(200).json({ok:true,readOnly:!canTriage(),items,
     counts:Object.fromEntries(['unhandled','working','resolved'].map(x=>[x,
       Number(counts.find(v=>v.state===x)?.count||0)]))});
  }catch{
   return reply(res,503,'INCIDENT_READ_UNAVAILABLE','障害台帳の読み取りができません');
  }
 }
 if(!['start','resolve'].includes(data.action))
   return reply(res,400,'UNKNOWN_ACTION','不明な操作です');
 if(!canTriage())return reply(res,503,'INCIDENT_TRIAGE_DISABLED','対応状態の更新はまだ停止中です');
 let parsed;
 try{parsed=normalizeTriage(data)}catch{
   return reply(res,400,'INVALID_TRANSITION','対応操作の内容を確認してください');
 }
 const p=pool();let client;
 try{
  client=await p.connect();
  const result=await transitionIncident(client,parsed,codeOK?'admin-code':'admin-passkey');
  return res.status(200).json({ok:true,result});
 }catch{
  return reply(res,409,'INCIDENT_OPERATION_UNCERTAIN',
   '対応状態を確定できません。同じ操作IDで再確認してください');
 }finally{
  client?.release();
 }
}
