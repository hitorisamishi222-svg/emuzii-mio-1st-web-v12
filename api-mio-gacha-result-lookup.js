// Read-only, admin-authenticated verification of a committed draw in existing GAS history.
import {authorizedCode} from './api-gacha-web-gate.js';
import {sessionOK} from './gacha-passkey-auth.js';
import {prepare,bridge} from './bridge.js';
const SITE='emuzii-mio-1st-web-v12.vercel.app';
const RELEASE='verified-existing-gas-draw-lookup-20261031';
const reply=(res,status,code,error)=>res.status(status).json({ok:false,code,error});
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==SITE||req.headers.origin!=='https://'+SITE)
  return reply(res,403,'ORIGIN_INVALID','管理サイトから操作してください');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
  return reply(res,415,'INVALID_CONTENT_TYPE','操作形式を確認してください');
 if(Number(req.headers['content-length']||0)>600)
  return reply(res,413,'INVALID_LENGTH','入力が長すぎます');
 let d;
 try{d=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return reply(res,400,'INVALID_JSON','不正な操作内容です')}
 if(!d||Array.isArray(d)||typeof d!=='object')return reply(res,400,'INVALID_BODY','入力を確認してください');
 if(!authorizedCode(d.code,process.env.MIO_GACHA_WEB_KEY_SHA256)&&!(await sessionOK(req)))
  return reply(res,403,'ADMIN_REQUIRED','管理者コードかFace IDで認証してください');
 if(process.env.MIO_GACHA_RESULT_LOOKUP_RELEASE!==RELEASE)
  return reply(res,503,'RESULT_LOOKUP_DISABLED','確定結果の照会は既存GAS接続確認まで停止中です');
 if(!/^MIO-W-[a-f0-9]{24}$/.test(d.webId||'')||!/^[a-f0-9]{32}$/.test(d.drawId||''))
  return reply(res,400,'INVALID_LOOKUP','登録IDと抽選IDを確認してください');
 try{
  const data=await bridge('webAdminOpsDrawLookup',{webId:d.webId,drawId:d.drawId});
  if(data?.ok!==true||!['confirmed','unconfirmed','identity_unverified','conflict'].includes(data.status))
   return reply(res,424,'GAS_CONTRACT_REQUIRED','既存GASとの照会連携が確認できません');
  if(data.status!=='confirmed')return res.status(200).json({ok:true,status:data.status});
  if(data.webId!==d.webId||data.drawId!==d.drawId||
     !/^MIO-\d{4}$/.test(data.mioId||'')||
     !['通常','ラキフェス'].includes(data.mode)||
     typeof data.prize!=='string'||!data.prize.trim()||
     !Number.isSafeInteger(Number(data.ordinal))||Number(data.ordinal)<1)
   return reply(res,424,'GAS_CONTRACT_MISMATCH','当選台帳の照合条件が一致しません');
  return res.status(200).json({ok:true,status:'confirmed',webId:d.webId,
    mioId:data.mioId,name:String(data.name||'').slice(0,80),drawId:d.drawId,
    mode:data.mode,prize:data.prize.slice(0,200),ordinal:Number(data.ordinal),
    rarity:String(data.rarity||'').slice(0,30),image:typeof data.image==='string'&&/^https:\/\//.test(data.image)?data.image.slice(0,1500):''});
 }catch{
  return reply(res,502,'LOOKUP_UNAVAILABLE','照会先に接続できません。再抽選せず復旧を確認してください');
 }
}
