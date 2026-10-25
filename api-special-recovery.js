import {prepare,bridge,hash,sessionCookie} from './bridge.js';

/** Administrator-issued, short-lived, participant-scoped recovery ticket.
 * No browser-provided administrator flags are trusted.
 * The GAS side validates and atomically consumes the ticket under its script lock.
 */
export default async function handler(req,res) {
  const cfg=prepare(req,res);
  if (!cfg) return;
  if (process.env.MIO_SPECIAL_RECOVERY_RELEASE!=='verified-two-participant-r3')
    return res.status(503).json({ok:false,error:'特例復旧は準備中です'});
  const {ticket,participantId,deviceToken}=req.body||{};
  if (typeof ticket!=='string'||!/^MIO-R1-[a-f0-9]{64}$/.test(ticket)||
      typeof participantId!=='string'||!/^MIO-W-[a-f0-9]{24}$/.test(participantId)||
      typeof deviceToken!=='string'||!/^[a-f0-9]{64}$/.test(deviceToken))
    return res.status(400).json({ok:false,error:'復旧申請を確認できません'});
  const tokenHash=hash(deviceToken);
  try {
    const result=await bridge('adminSpecialRecover',{
      participantId,tokenHash,grantHash:hash(ticket)
    });
    if(result.ok!==true||result.recoveryApproved!==true||
       result.boundTokenHash!==tokenHash||result.approvedWebId!==participantId||
       !['MIO-0010','MIO-0018'].includes(result.approvedMasterId)||
       result.integratedParticipantId!==result.approvedMasterId)
      throw new Error('recovery identity mismatch');
    res.setHeader('Set-Cookie',sessionCookie(participantId,deviceToken,cfg.secret));
    return res.status(200).json({ok:true,recovered:true});
  } catch {
    return res.status(403).json({ok:false,error:'復旧リンクを確認できませんでした。管理者に連絡してください'});
  }
}
