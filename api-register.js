import {prepare,bridge,makeIdentity,hash,sessionCookie,readSession} from './bridge.js';
import {readRegistrationAttempt,issueRegistrationAttempt,clearRegistrationAttempt} from './registration-attempt.js';
export default async function handler(req,res){const cfg=prepare(req,res);if(!cfg)return;
// Fail closed until production GAS deployment and isolated end-to-end registration are verified.
// A preview build or accidental merge must not enable registrations.
if(process.env.MIO_REGISTRATION_RELEASE!=='verified-gas-identity-20261016'){
 return res.status(503).json({ok:false,error:'新規ブラウザ登録は本人確認の安全点検中です。以前登録した端末をご利用いただくか、運営へお問い合わせください。'});
}
try{
const name=String(req.body?.name||'').trim();if(name.length<1||name.length>40||/[\u0000-\u001f]/.test(name))return res.status(400).json({ok:false,error:'ColorSing名を1〜40文字で入力してください'});
const loginId=String(req.body?.loginId||'').trim();if(loginId.length>32||/[\u0000-\u001f]/.test(loginId))return res.status(400).json({ok:false,error:'ログインIDを確認してください'});
if(readSession(req.headers.cookie,cfg.secret))return res.status(409).json({ok:false,error:'この端末は登録済みです。参加状況を確認してください'});
const pending=readRegistrationAttempt(req.headers.cookie,cfg.secret);
if(pending&&(pending.name!==name||pending.loginId!==loginId))return res.status(409).json({ok:false,error:'この端末では別の登録を確認中です。最初に送信した登録名で再試行してください'});
const {id,token}=pending||makeIdentity();
// Persist the signed retry identity before invoking the non-transactional GAS write.
// An ambiguous timeout may be retried safely with the same browser identity.
if(!pending)res.setHeader('Set-Cookie',issueRegistrationAttempt({id,token,name,loginId},cfg.secret));
const d=await bridge('register',{participantId:id,tokenHash:hash(token),name,loginId,memberClaim:req.body?.memberClaim===true});
if(d.participantId!==id||d.verified!==true)throw Error('登録の保存を確認できませんでした');
res.setHeader('Set-Cookie',[sessionCookie(id,token,cfg.secret),clearRegistrationAttempt()]);return res.status(201).json({ok:true,participantId:id,status:d.status,name,loginId:d.loginId||'',recovered:!!d.recovered});
}catch(e){const msg=e?.message||'保存を確認できませんでした。登録は確定していません。時間をおいてお試しください';res.status(msg.includes('ログインID')||msg.includes('登録済み')?409:502).json({ok:false,error:msg})}}
