import {prepare,bridge,readSession,hash,sessionCookie} from './bridge.js';
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;const s=readSession(req.headers.cookie,cfg.secret);
 if(!s)return res.status(401).json({ok:false,error:'この端末の登録情報がありません'});
 const keyword=String(req.body?.keyword||'').trim();const day=Number(req.body?.day);if(!Number.isInteger(day)||day<1||day>31)return res.status(400).json({ok:false,error:'10/1〜10/31の日付を選んでください'});if(!keyword||keyword.length>40)return res.status(400).json({ok:false,error:'今日の確認文字を入力してください'});
 try{const d=await bridge('checkin',{participantId:s.id,tokenHash:hash(s.token),keyword,day});if(d.participantId!==s.id)throw Error('登録を確認できません');res.setHeader('Set-Cookie',sessionCookie(s.id,s.token,cfg.secret));res.status(200).json(d)}catch(e){res.status(409).json({ok:false,error:e.message||'確認できませんでした'})}
}
