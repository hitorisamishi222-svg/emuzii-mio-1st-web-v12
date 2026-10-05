import {prepare,bridge,readSession,hash} from './bridge.js';

export default async function handler(req,res){
  const cfg=prepare(req,res);
  if(!cfg)return;
  const s=readSession(req.headers.cookie,cfg.secret);
  if(!s)return res.status(401).json({ok:false,error:'この端末の登録情報がありません。参加状況をもう一度確認してください。'});

  const keyword=String(req.body?.keyword||'').trim();
  const day=Number(req.body?.day);
  if(!Number.isInteger(day)||day<1||day>31){
    return res.status(400).json({ok:false,error:'10/1〜10/31の日付を選んでください'});
  }
  if(!keyword||keyword.length>40){
    return res.status(400).json({ok:false,error:'確認文字を入力してください'});
  }

  try{
    const d=await bridge('checkin',{
      participantId:s.id,
      tokenHash:hash(s.token),
      keyword,
      day
    });
    if(d.participantId!==s.id)throw Error('登録を確認できません');
    return res.status(200).json(d);
  }catch(e){
    const raw=String(e?.message||'');
    const error=raw==='unauthorized'
      ? '皆勤認証の連携が古い状態です。運営側で連携更新後、もう一度お試しください。'
      : (raw||'確認できませんでした');
    return res.status(409).json({ok:false,error});
  }
}
