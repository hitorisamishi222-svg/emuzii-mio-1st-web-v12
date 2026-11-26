import {createHash} from 'node:crypto';
const digest = data => createHash('sha256').update(data).digest('hex');
export function checkedOrigin(raw, proof, sha){
  const u = new URL(raw);
  if(u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) throw Error('INVALID_PREVIEW_ORIGIN');
  if(!/^emuzii-mio-1st-web-v12-[a-z0-9]+-gtgz8867jh-3139\.vercel\.app$/.test(u.hostname)) throw Error('PREVIEW_DEPLOYMENT_URL_REQUIRED');
  if(!proof || proof.projectId!=='prj_R32eZ4q5SBTmm0fQFqdG4XhKdO2F' || proof.target!==null || proof.readyState!=='READY' || proof.url!==u.hostname || !/^[a-f0-9]{40}$/.test(sha||'') || proof.commitSha!==sha) throw Error('PREVIEW_METADATA_MISMATCH');
  return u;
}
const allowed = /^\/(?:gacha\.html|gacha-deluxe-v21\.(?:css|js)|gacha-prize-demo-catalog\.json|assets\/mio-undersea-palace-stage\.svg|gacha-(?:mem|lf)-\d{2}\.jpg)$/;
export async function verifiedAsset({origin,path,localBytes,fetchImpl=fetch,secret}){
  if(!allowed.test(path)) throw Error('STATIC_ASSET_ONLY');
  const response=await fetchImpl(new URL(path,origin),{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'*/*',...(secret?{'x-vercel-protection-bypass':secret}:{})}});
  if(response.status===401||response.status===403) throw Error('PREVIEW_AUTH_REQUIRED');
  if(response.status>=300&&response.status<400) throw Error('PREVIEW_REDIRECT_REFUSED');
  if(!response.ok) throw Error('PREVIEW_HTTP_'+response.status);
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const body=Buffer.from(await response.arrayBuffer());
  const txt=path.endsWith('.jpg')?'':body.toString('utf8');
  if(/Authentication Required|_vercel_sso_nonce|Deployment Protection|VERCEL_AUTH/i.test(txt)) throw Error('PREVIEW_AUTH_PAGE');
  const goodType=path.endsWith('.js')?/^(?:application|text)\/(?:x-)?javascript$/.test(type):path.endsWith('.css')?type==='text/css':path.endsWith('.svg')?type==='image/svg+xml':path.endsWith('.jpg')?type==='image/jpeg':path.endsWith('.json')?type==='application/json':type==='text/html';
  if(!goodType) throw Error('PREVIEW_WRONG_CONTENT_TYPE');
  if(path.endsWith('.jpg')&&(body[0]!==255||body[1]!==216||body[2]!==255)) throw Error('PREVIEW_INVALID_JPEG');
  if(digest(body)!==digest(localBytes)) throw Error('PREVIEW_CONTENT_MISMATCH');
  return {path,bytes:body.length,sha256:digest(body)};
}
