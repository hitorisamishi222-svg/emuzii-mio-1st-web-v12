// Gacha-only invite route. Default OFF. Never grants the full-site session.
// Requires the existing bound GAS to handle inviteRedeem under its script lock.
import {createHmac,timingSafeEqual} from 'node:crypto';
import {prepare,bridge,makeIdentity,hash} from './bridge.js';
const COOKIE='mio_invite_gacha',PENDING='mio_invite_pending',PATH='/api/gacha-invite';
const TTL=7*24*60*60,PENDING_TTL=15*60;
const release=()=>process.env.MIO_GACHA_INVITE_RELEASE==='verified-gas-invite-20261030';
function sign(payload,secret){
 const data=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const mac=createHmac('sha256',secret).update(data).digest('base64url');
 return data+'.'+mac;
}
function verify(value,secret,expectedScope){
 try{
  if(typeof value!=='string'||value.length>450)return null;
  const [data,mac,...rest]=value.split('.');
  if(rest.length||!data||!mac)return null;
  const expected=createHmac('sha256',secret).update(data).digest();
  const supplied=Buffer.from(mac,'base64url');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return null;
  const obj=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
  const now=Math.floor(Date.now()/1000);
  if(obj.scope!==expectedScope||!/^MIO-W-[a-f0-9]{24}$/.test(obj.id)||!/^[a-f0-9]{64}$/.test(obj.token)||
      !Number.isSafeInteger(obj.iat)||!Number.isSafeInteger(obj.exp)||obj.iat>now+60||obj.exp<=now||
      obj.exp-obj.iat>(expectedScope==='pending'?PENDING_TTL:TTL))return null;
  return obj;
 }catch{return null}
}
function cookieName(header,name){
 return String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
}
function cookie(name,payload,secret,age){
 return name+'='+sign(payload,secret)+'; Path='+PATH+'; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
}
function clear(name){return name+'=; Path='+PATH+'; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}
export function normalizeInviteCode(value){
 const v=String(value||'').trim().toUpperCase().replace(/[\s-]/g,'');
 return /^MI[0-9A-F]{16}$/.test(v)?v:null;
}
export function issueInviteSession(id,token,secret,now=Math.floor(Date.now()/1000)){
 return cookie(COOKIE,{scope:'gacha',id,token,iat:now,exp:now+TTL},secret,TTL);
}
export function readInviteSession(headers,secret){return verify(cookieName(headers,COOKIE),secret,'gacha')}
function issuePending(id,token,secret,code,now=Math.floor(Date.now()/1000)){
 return cookie(PENDING,{scope:'pending',id,token,codeHash:hash(code),iat:now,exp:now+PENDING_TTL},secret,PENDING_TTL);
}
function readPending(headers,secret,code){
 const p=verify(cookieName(headers,PENDING),secret,'pending');
 return p&&p.codeHash===hash(code)?p:null;
}
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 // The deployed application cannot accidentally enable this route on its own.
 if(!release())return res.status(503).json({ok:false,error:'招待ガチャの公開準備中です'});
 if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||'')))
   return res.status(415).json({ok:false,error:'操作形式が不正です'});
 let input;try{input=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return res.status(400).json({ok:false,error:'入力を確認してください'})}
 if(!input||typeof input!=='object'||Array.isArray(input))return res.status(400).json({ok:false,error:'入力を確認してください'});
 const action=input.action;
 if(!['redeem','catalog','draw','history','logout'].includes(action))return res.status(400).json({ok:false,error:'操作を確認してください'});
 if(action==='logout'){res.setHeader('Set-Cookie',[clear(COOKIE),clear(PENDING)]);return res.status(200).json({ok:true})}
 if(action==='redeem'){
  const code=normalizeInviteCode(input.code);
  if(!code)return res.status(400).json({ok:false,error:'招待コードを確認してください'});
  if(readInviteSession(req.headers.cookie,cfg.secret))return res.status(409).json({ok:false,error:'この端末はすでにガチャへ参加しています'});
  const prior=readPending(req.headers.cookie,cfg.secret,code);
  const identity=prior||makeIdentity();
  // If GAS answered but the network dropped, the same signed temporary identity may retry.
  res.setHeader('Set-Cookie',issuePending(identity.id,identity.token,cfg.secret,code));
  try{
   const d=await bridge('inviteRedeem',{participantId:identity.id,tokenHash:hash(identity.token),code});
   if(d.participantId!==identity.id||d.verified!==true)throw Error('招待コードの確認に失敗しました');
   res.setHeader('Set-Cookie',[issueInviteSession(identity.id,identity.token,cfg.secret),clear(PENDING)]);
   return res.status(200).json({ok:true,confirmed:true,remaining:Number(d.remaining)||0});
  }catch(e){return res.status(409).json({ok:false,error:e.message||'招待コードを確認できませんでした'})}
 }
 const session=readInviteSession(req.headers.cookie,cfg.secret);
 if(!session)return res.status(401).json({ok:false,error:'招待コードでの認証が必要です'});
 if(action==='draw'&&(!/^[a-f0-9]{32}$/.test(input.drawId||'')||!['通常','ラキフェス'].includes(input.mode)))
   return res.status(400).json({ok:false,error:'抽選要求が不正です'});
 try{
  const data=await bridge(action,{participantId:session.id,tokenHash:hash(session.token),...(action==='draw'?{drawId:input.drawId,mode:input.mode}:{})});
  if(data.participantId!==session.id)throw Error('参加情報が一致しません');
  return res.status(200).json(data);
 }catch(e){return res.status(409).json({ok:false,error:e.message||'抽選状態を確認できませんでした'})}
}
