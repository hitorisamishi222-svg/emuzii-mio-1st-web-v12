// MIO museum — isolated Preview-only owner session contract (UNROUTED).
// The legacy gallery-auth-shared.checkOrigin stays PRODUCTION-ONLY and MUST
// NOT be broadened. This module uses the existing gallery_admin_sessions +
// approved-device verification, not a new login ID or an owner claim in JSON.
// Deployment and expected metadata must come from a trusted server/control
// plane. Matching strings alone cannot prove a real Vercel/Neon binding.
// Preview cookies are NOT issued yet: nothing here creates a login session.
import {verifyGalleryAdmin} from './gallery-auth-shared.js';

const BRANCH='feature/mio-v2-integration-mainbaseline-20261102';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{40}$/i;
const HOST=/^emuzii-mio-1st-web-v12-[a-z0-9-]+\.vercel\.app$/;
const PROJECT=/^prj_[A-Za-z0-9]+$/;
const str=x=>typeof x==='string'&&x.length>0;

export async function verifyMuseumPreviewOwnerSessionStage(client,request,{
 deployment,expected
}={}){
 if(!client||typeof client.query!=='function'||!request||
    request.method!=='POST'||!request.headers||!deployment||!expected)return null;
 const h=request.headers,d=deployment,e=expected;
 // Never trust Host/Origin alone. Vercel deployment identity needs to be
 // established out-of-band, with metadata tied to the exact candidate commit.
 if(d.target!=='preview'||d.gitBranch!==BRANCH||
    !PROJECT.test(d.projectId||'')||d.projectId!==e.projectId||
    !SHA.test(d.gitSha||'')||d.gitSha!==e.gitSha||
    !HOST.test(d.hostname||'')||d.hostname!==e.hostname||
    d.hostname==='emuzii-mio-1st-web-v12.vercel.app')return null;
 const origin='https://'+d.hostname;
 if(!str(h.host)||h.host!==d.hostname||h.origin!==origin||
    !/^application\/json(?:;|$)/i.test(h['content-type']||'')||
    (h['x-forwarded-host']!==undefined&&h['x-forwarded-host']!==d.hostname)||
    (h['sec-fetch-site']!==undefined&&h['sec-fetch-site']!=='same-origin')||
    (h['sec-fetch-mode']!==undefined&&h['sec-fetch-mode']!=='cors'))
  return null;
 // Our legacy session cookies are host-only in production. On a separate
 // Preview host, they cannot be reused. A separate, reviewed Preview login
 // will be required before this can authenticate real owners.
 let user;
 try{user=await verifyGalleryAdmin(client,request)}catch{return null}
 if(user?.role!=='owner'||!UUID.test(user.user_id||'')||
    !UUID.test(user.device_id||''))return null;
 return Object.freeze({ownerId:user.user_id.toLowerCase(),
  deviceId:user.device_id.toLowerCase(),role:'owner'});
}
