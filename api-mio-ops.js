// Existing MIO project only; ops are isolated from public registration and gacha APIs.
// The new operations are not enabled until the existing GAS is updated and reviewed.
import { createHash, timingSafeEqual } from 'node:crypto';
import { prepare, bridge } from './bridge.js';

const RELEASE='verified-mio-ops-gas-20261030';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const READ=['overview','pending','detail','intakeList','grantHistory'];
const WRITE=['approve','grant','intakeCreate','intakeMark'];
const ERROR=(res,status,error)=>res.status(status).json({ok:false,error});

function secureCode(input,hash) {
  if(typeof input!=='string'||input.length<24||input.length>160||
     typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))return false;
  return timingSafeEqual(createHash('sha256').update(input).digest(),Buffer.from(hash,'hex'));
}
export default async function handler(req,res) {
  const cfg=prepare(req,res);if(!cfg)return;
  res.setHeader('Vary','Origin');res.setHeader('Cache-Control','private, no-store');
  if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
    return ERROR(res,403,'管理画面から操作してください');
  if(process.env.MIO_OPS_ADMIN_RELEASE!==RELEASE)
    return ERROR(res,503,'管理機能の接続準備中です');
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
    return ERROR(res,415,'操作形式を確認してください');
  if(Number(req.headers['content-length']||0)>4096)return ERROR(res,413,'入力が長すぎます');
  let data;try {data=typeof req.body==='string'?JSON.parse(req.body):req.body;}
  catch{return ERROR(res,400,'入力を確認してください');}
  if(!data||Array.isArray(data)||typeof data!=='object'||
     !secureCode(data.code,process.env.MIO_OPS_ADMIN_KEY_SHA256))
    return ERROR(res,403,'管理者認証を確認してください');
  const action=data.action;
  if(!READ.includes(action)&&!WRITE.includes(action))
    return ERROR(res,400,'管理操作を確認してください');
  if(WRITE.includes(action)&&
     (typeof data.requestId!=='string'||!/^[a-f0-9]{32}$/.test(data.requestId)))
    return ERROR(res,400,'操作番号を確認してください');
  if((action==='approve'||action==='grant'||action==='detail')&&
     !/^MIO-(?:W-[a-f0-9]{24}|\d{4})$/.test(String(data.subjectId||'')))
    return ERROR(res,400,'対象IDを確認してください');
  if(action==='grant'&&(!Number.isSafeInteger(data.amount)||data.amount<1||data.amount>30||
     typeof data.reason!=='string'||data.reason.trim().length<2||data.reason.length>100||
     !Number.isSafeInteger(data.expectedBonus)||data.expectedBonus<0))
    return ERROR(res,400,'付与回数・理由・現在値を確認してください');
  if(action==='approve'&&(!/^MIO-\d{4}$/.test(String(data.masterId||''))||
     typeof data.memberConfirmed!=='boolean'))
    return ERROR(res,400,'本人照合とメンシプ確認を指定してください');
  if(action==='intakeCreate'&&(!data.name||typeof data.name!=='string'||
     data.name.trim().length>40||data.name.trim().length<1))
    return ERROR(res,400,'受付名を確認してください');
  try{
    const payload={...data};delete payload.code;
    const out=await bridge('mioOps',payload);
    if(out.ok!==true)throw Error(out.error||'管理台帳との接続に失敗しました');
    return res.status(200).json(out);
  }catch(e){
    return ERROR(res,409,String(e.message||'管理操作を確認できません').slice(0,200));
  }
}
