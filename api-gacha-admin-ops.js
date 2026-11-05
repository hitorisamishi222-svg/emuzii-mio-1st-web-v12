// Separate emergency Web-admin API: read intake, approve, grant and review.
// Existing two-switch API is deliberately untouched.
// Feature disabled until existing GAS module and owner verification are complete.
import {authorizedCode} from './api-gacha-web-gate.js';
import {prepare,bridge} from './bridge.js';
import {sessionOK} from './gacha-passkey-auth.js';
const SITE='emuzii-mio-1st-web-v12.vercel.app';
const RELEASE='verified-existing-gas-ops-20261030';
// A small onsite release can be enabled independently of the museum upgrade.
// Writes still require existing GAS webAdminOps support and administrator auth.
const ONSITE_RELEASE='operator-verified-onsite-20261105';
const reply=(res,status,message)=>res.status(status).json({ok:false,error:message});
const operations={read:'webAdminOpsRead',approve:'webAdminOpsApprove',grant:'webAdminOpsGrant',review:'webAdminOpsReview',intake:'webAdminOpsIntake',create:'webAdminOpsCreate'};
const ID=/^[a-f0-9]{32}$/;
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==SITE||req.headers.origin!=='https://'+SITE)
   return reply(res,403,'管理サイトから操作してください');
 const standardEnabled=process.env.MIO_GACHA_ADMIN_OPS_RELEASE===RELEASE;
 const onsiteEnabled=process.env.MIO_GACHA_ONSITE_RELEASE===ONSITE_RELEASE;
 const writeEnabled=standardEnabled||onsiteEnabled;
 const writeMode=standardEnabled?'standard':onsiteEnabled?'onsite':'locked';
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(res,415,'操作形式が不正です');
 if(Number(req.headers['content-length']||0)>2048)return reply(res,413,'入力が長すぎます');
 let d;try{d=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return reply(res,400,'不正なJSONです')}
 if(!d||typeof d!=='object'||Array.isArray(d))return reply(res,400,'操作内容が不正です');
 if(!authorizedCode(d.code,process.env.MIO_GACHA_WEB_KEY_SHA256)&&!(await sessionOK(req)))
   return reply(res,403,'管理者コードまたはFace IDの認証を確認してください');
 if(!Object.hasOwn(operations,d.action))return reply(res,400,'この操作は使用できません');
 if(d.action!=='read'&&!writeEnabled)
   return reply(res,503,'Web管理の書き込み接続が未有効です。既存GASの現場対応機能を確認してください');
 // All on-site mutations, including intake and simple-review, require a deliberate
 // per-person attestation. A code or passkey alone must never silently write.
 if(d.action!=='read'&&writeEnabled&&d.onSiteVerified!==true)
   return reply(res,400,'現場で対象者を確認してから個別承認スイッチを入れてください');
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
 }else if(d.action==='create'){
  if(typeof d.webId!=='string'||!/^MIO-W-[a-f0-9]{24}$/.test(d.webId)||
     d.expectedStatus!=='承認待ち'||!ID.test(d.operationId||''))
     return reply(res,400,'新規受付内容が不正です');
  Object.assign(data,{webId:d.webId,expectedStatus:d.expectedStatus,operationId:d.operationId});
 }else if(d.action==='intake'){
  if(typeof d.name!=='string'||!d.name.trim()||d.name.trim().length>40||
     typeof d.note!=='string'||d.note.length>120||!ID.test(d.operationId||''))
     return reply(res,400,'初訪問受付の入力を確認してください');
  Object.assign(data,{name:d.name.trim(),note:d.note.trim(),operationId:d.operationId});
 }else if(d.action==='review'){
  if(!Number.isInteger(d.row)||d.row<2||d.row>1000||
     typeof d.expectedStatus!=='string'||!d.expectedStatus.trim()||d.expectedStatus.length>60||
     typeof d.expectedName!=='string'||!d.expectedName.trim()||d.expectedName.length>80||
     typeof d.expectedBrowserId!=='string'||d.expectedBrowserId.length>120||
     typeof d.expectedCreatedAt!=='string'||!d.expectedCreatedAt.trim()||d.expectedCreatedAt.length>100||
     !ID.test(d.operationId||''))
     return reply(res,400,'簡易登録の本人照合情報が不足しています。台帳を再読み込みしてください');
  Object.assign(data,{row:d.row,expectedStatus:d.expectedStatus,expectedName:d.expectedName.trim(),expectedBrowserId:d.expectedBrowserId,expectedCreatedAt:d.expectedCreatedAt,operationId:d.operationId});
 }
 try{
  const result=await bridge(operations[d.action],data);
  if(result.ok!==true)throw Error('操作結果の確認に失敗しました');
  if(d.action==='read'){
   if(!Array.isArray(result.pending)||!Array.isArray(result.roster)||!Array.isArray(result.simple))
     throw Error('受付状態を読み取れません');
   return res.status(200).json({ok:true,writeEnabled,writeMode,pending:result.pending,roster:result.roster,simple:result.simple,grants:Array.isArray(result.grants)?result.grants:[],totalPending:result.totalPending||0,rejectedCount:result.rejectedCount||0});
  }
  return res.status(200).json({ok:true,result:{replayed:!!result.replayed,mioId:result.mioId||null,status:result.status||null,granted:result.granted||null,special:result.special??null,member:result.member||null}});
 }catch(e){
  const message=String(e?.message||e);
  console.error('gacha web admin ops failure',d.action,message);
  if(d.action==='read'&&/invalid identity|unknown action|未対応の管理操作/i.test(message))
    return res.status(424).json({ok:false,code:'GAS_UPDATE_REQUIRED',error:'既存GASの運営管理連携が未更新です。接続手順を確認してください'});
  return reply(res,409,d.action==='read'?'管理台帳に接続できませんでした。接続状態を確認してください':'操作を確定できません。状態を再読み込みして確認してください');
 }
}
