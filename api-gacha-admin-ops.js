// Separate emergency Web-admin API: read intake, approve, grant and review.
// Existing two-switch API is deliberately untouched.
// Feature disabled until existing GAS module and owner verification are complete.
import {authorizedCode} from './api-gacha-web-gate.js';
import {prepare,bridge} from './bridge.js';
const SITE='emuzii-mio-1st-web-v12.vercel.app';
const RELEASE='verified-existing-gas-ops-20261030';
const reply=(res,status,message)=>res.status(status).json({ok:false,error:message});
const operations={read:'webAdminOpsRead',approve:'webAdminOpsApprove',grant:'webAdminOpsGrant',review:'webAdminOpsReview'};
const ID=/^[a-f0-9]{32}$/;
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==SITE||req.headers.origin!=='https://'+SITE)
   return reply(res,403,'管理サイトから操作してください');
 if(process.env.MIO_GACHA_ADMIN_OPS_RELEASE!==RELEASE)
   return reply(res,503,'Web受付・回数管理は接続検証中です');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(res,415,'操作形式が不正です');
 if(Number(req.headers['content-length']||0)>2048)return reply(res,413,'入力が長すぎます');
 let d;try{d=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return reply(res,400,'不正なJSONです')}
 if(!d||typeof d!=='object'||Array.isArray(d))return reply(res,400,'操作内容が不正です');
 if(!authorizedCode(d.code,process.env.MIO_GACHA_WEB_KEY_SHA256))return reply(res,403,'管理者コードを確認してください');
 if(!Object.hasOwn(operations,d.action))return reply(res,400,'この操作は使用できません');
 const data={};
 if(d.action==='approve'){
  if(typeof d.webId!=='string'||!/^MIO-W-[a-f0-9]{24}$/.test(d.webId)||
    typeof d.mioId!=='string'||!/^MIO-\d{4}$/.test(d.mioId)||
    d.expectedStatus!=='承認待ち'||typeof d.memberConfirmed!=='boolean'||!ID.test(d.operationId||''))
    return reply(res,400,'承認内容が不正です');
  Object.assign(data,{webId:d.webId,mioId:d.mioId,expectedStatus:d.expectedStatus,memberConfirmed:d.memberConfirmed,operationId:d.operationId});
 }else if(d.action==='grant'){
  if(typeof d.mioId!=='string'||!/^MIO-\d{4}$/.test(d.mioId)||
     !Number.isInteger(d.count)||d.count<1||d.count>50||
     !Number.isSafeInteger(d.expectedSpecial)||d.expectedSpecial<0||
     typeof d.reason!=='string'||d.reason.trim().length<2||d.reason.length>120||
     !ID.test(d.operationId||''))
     return reply(res,400,'付与内容が不正です');
  Object.assign(data,{mioId:d.mioId,count:d.count,expectedSpecial:d.expectedSpecial,reason:d.reason.trim(),operationId:d.operationId});
 }else if(d.action==='review'){
  if(!Number.isInteger(d.row)||d.row<2||d.row>1000||
     typeof d.expectedStatus!=='string'||d.expectedStatus.length>60||!ID.test(d.operationId||''))
     return reply(res,400,'簡易登録の確認内容が不正です');
  Object.assign(data,{row:d.row,expectedStatus:d.expectedStatus,operationId:d.operationId});
 }
 try{
  const result=await bridge(operations[d.action],data);
  if(result.ok!==true)throw Error('操作結果の確認に失敗しました');
  if(d.action==='read'){
   if(!Array.isArray(result.pending)||!Array.isArray(result.roster)||!Array.isArray(result.simple))
     throw Error('受付状態を読み取れません');
   return res.status(200).json({ok:true,pending:result.pending,roster:result.roster,simple:result.simple,totalPending:result.totalPending||0});
  }
  return res.status(200).json({ok:true,result:{replayed:!!result.replayed,mioId:result.mioId||null,status:result.status||null,granted:result.granted||null,special:result.special??null,member:result.member||null}});
 }catch(e){
  console.error('gacha web admin ops failure',d.action,String(e?.message||e));
  return reply(res,409,'操作を確定できません。状態を再読み込みして確認してください');
 }
}
