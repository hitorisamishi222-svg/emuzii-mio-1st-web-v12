import {randomBytes, timingSafeEqual} from 'node:crypto';
import {prepare, bridge, hash, sessionCookie} from './bridge.js';

// Admin-only recovery. Never grants access from a participant name or login ID alone.
// The Apps Script action must atomically verify the approved MIO-0010 record,
// bind the fresh token hash, and preserve all existing attendance records.
export default async function handler(req,res){
  const cfg=prepare(req,res); if(!cfg)return;
  const expected=process.env.MIO_ADMIN_RECOVERY_SECRET||'';
  const supplied=String(req.headers['x-mio-admin-recovery-secret']||'');
  if(expected.length<32||supplied.length!==expected.length||
    !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))
    return res.status(403).json({ok:false,error:'管理者認証が必要です'});
  const loginId=String(req.body?.loginId||'').trim().toUpperCase();
  if(loginId!=='MIO-54F7-C68D')
    return res.status(400).json({ok:false,error:'対象外のログインIDです'});
  const id='MIO-W-'+randomBytes(12).toString('hex');
  const token=randomBytes(32).toString('hex');
  try{
    const d=await bridge('admin_recover_markun',{
      participantId:id,tokenHash:hash(token),
      linkedParticipantId:'MIO-0010',loginId
    });
    if(d.ok!==true||d.verified!==true||d.participantId!==id||
       d.linkedParticipantId!=='MIO-0010'||d.status!=='承認済み')
      throw Error('復旧登録の確認に失敗しました');
    res.setHeader('Set-Cookie',sessionCookie(id,token,cfg.secret));
    return res.status(200).json({ok:true,linkedParticipantId:'MIO-0010'});
  }catch{
    return res.status(409).json({ok:false,error:'復旧処理が未対応、または承認確認に失敗しました'});
  }
}
