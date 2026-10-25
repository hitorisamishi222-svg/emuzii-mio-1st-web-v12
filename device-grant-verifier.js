import {createHmac,timingSafeEqual} from 'node:crypto';

/**
 * Verify an administrator-issued device grant. Never trust a browser-supplied
 * "adminVerified" boolean. Grants must be minted only after real admin auth.
 * A backend must atomically consume the grant nonce before device enrollment.
 */
export function verifyDeviceGrant({grant,signature,secret,now=Date.now()}={}) {
  if (typeof secret!=='string'||secret.length<32||!grant||
      typeof grant!=='object'||typeof signature!=='string') return null;
  const {webId,masterId,deviceProofHash,nonce,expiresAt,scope,issuer}=grant;
  if (!/^MIO-W-[a-f0-9]{24}$/.test(webId||'') ||
      !/^MIO-\d{4,}$/.test(masterId||'') ||
      !/^[a-f0-9]{64}$/.test(deviceProofHash||'') ||
      !/^[a-f0-9]{32,64}$/.test(nonce||'') ||
      scope!=='device-enroll' || issuer!=='authenticated-admin' ||
      !Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>now+300000)
    return null;
  const data=JSON.stringify({webId,masterId,deviceProofHash,nonce,expiresAt,scope,issuer});
  const expected=createHmac('sha256',secret).update(data).digest();
  let supplied;
  try {supplied=Buffer.from(signature,'base64url');} catch {return null;}
  if (supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return null;
  return {webId,masterId,deviceProofHash,nonce,expiresAt};
}
