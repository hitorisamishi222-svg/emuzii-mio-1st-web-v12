import {prepare,bridge,hash,sessionCookie} from './bridge.js';
import {verifyDeviceGrant} from './device-grant-verifier.js';

/** Staged additive-device recovery. No new registration, no original token overwrite.
 * A separately authenticated administrator must first sign the grant, binding
 * its deviceProofHash to the 64-hex token held by the recipient browser.
 * Endpoint remains disabled until production GAS and admin issuance are verified.
 */
export default async function handler(req,res) {
  const cfg=prepare(req,res);
  if(!cfg)return;
  if(process.env.MIO_DEVICE_ENROLL_RELEASE!=='verified-additive-device-v1')
    return res.status(503).json({ok:false,error:'端末復旧は準備中です'});
  const {grant,signature,deviceToken}=req.body||{};
  if(typeof deviceToken!=='string'||!/^[a-f0-9]{64}$/.test(deviceToken))
    return res.status(400).json({ok:false,error:'端末認証情報が不正です'});
  const verified=verifyDeviceGrant({grant,signature,secret:cfg.secret});
  if(!verified||hash(deviceToken)!==verified.deviceProofHash ||
      !['MIO-0010','MIO-0018'].includes(verified.masterId))
    return res.status(403).json({ok:false,error:'復旧許可を確認できません'});
  try {
    const result=await bridge('enrollSignedDevice',{grant,signature});
    if(result.ok!==true||result.webId!==verified.webId||
       result.masterId!==verified.masterId)
      throw Error('GAS identity mismatch');
    res.setHeader('Set-Cookie',sessionCookie(verified.webId,deviceToken,cfg.secret));
    return res.status(200).json({ok:true,recovered:true});
  } catch {
    return res.status(409).json({ok:false,error:'復旧許可の使用または登録に失敗しました。管理者に確認してください'});
  }
}
