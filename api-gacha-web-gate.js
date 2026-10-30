// Minimal MIO 1st anniversary Web gate controls. No participant/admin DB mutations.
// Disabled until existing GAS is patched, tested and operator secret is installed.
import {createHash,timingSafeEqual} from 'node:crypto';
import {prepare,bridge} from './bridge.js';
import {sessionOK} from './gacha-passkey-auth.js';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const RELEASE='verified-gas-gate-20261030';
const fail=(res,status,message)=>res.status(status).json({ok:false,error:message});
export function authorizedCode(input,storedHash){
 if(typeof input!=='string'||input.length<20||input.length>160||
    !/^[a-f0-9]{64}$/.test(storedHash||''))return false;
 const expected=Buffer.from(storedHash,'hex');
 const actual=createHash('sha256').update(input).digest();
 return timingSafeEqual(actual,expected);
}
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 res.setHeader('Vary','Origin');
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
   return fail(res,403,'管理ページから操作してください');
 if(process.env.MIO_GACHA_WEB_RELEASE!==RELEASE)
   return fail(res,503,'Web管理ボタンは本番接続準備中です');
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
   return fail(res,415,'操作形式を確認してください');
 if(Number(req.headers['content-length']||0)>1024)
   return fail(res,413,'入力が長すぎます');
 let d;try{d=typeof req.body==='string'?JSON.parse(req.body):req.body}catch{return fail(res,400,'入力を確認してください')}
 if(!d||Array.isArray(d)||typeof d!=='object')return fail(res,400,'入力を確認してください');
 const codeAllowed=authorizedCode(d.code,process.env.MIO_GACHA_WEB_KEY_SHA256);
 if(!codeAllowed&&!(await sessionOK(req)))
   return fail(res,403,'管理者コードまたはFace IDの認証を確認してください');
 if(!['read','set'].includes(d.action))return fail(res,400,'不明な操作です');
 if(d.action==='set'&&(!['通常','ラキフェス'].includes(d.mode)||
    typeof d.enabled!=='boolean'||typeof d.expected!=='boolean'))
   return fail(res,400,'ON/OFFの指定が不正です');
 try{
  const result=await bridge(d.action==='read'?'webGateRead':'webGateSet',
    d.action==='set'?{mode:d.mode,enabled:d.enabled,expected:d.expected}:{});
  if(result.gateConfigured!==true||typeof result.normalOpen!=='boolean'||typeof result.festOpen!=='boolean')
   throw Error('実際の受付設定を確認できません');
  if(d.action==='set'&&
    (d.mode==='通常'?result.normalOpen:result.festOpen)!==d.enabled)
   throw Error('ON/OFFの反映確認ができません');
  return res.status(200).json({ok:true,normalOpen:result.normalOpen,festOpen:result.festOpen});
 }catch(error){
  return fail(res,409,error.message||'受付設定の反映を確認できません');
 }
}
