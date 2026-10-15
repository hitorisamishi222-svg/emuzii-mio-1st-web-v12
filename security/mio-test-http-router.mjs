// Framework-neutral TEST auth router. NOT mounted on the public Vercel preview.
// Hosting transport must enforce actual read-byte limits and supply trustedClientIp.
import {checkAuthRequest} from './mio-auth-request-guard.mjs';
import {createLoginRoute} from './mio-login-route.mjs';
export function createTestHttpRouter({api,throttle,trustedOrigin}={}){
 if(!api||['login','me','devices','logout','logoutAll','revokeDevice'].some(k=>typeof api[k]!=='function'))throw Error('complete auth API required');
 const login=createLoginRoute({api,throttle,trustedOrigin});
 const reads=new Map([['/test-auth/me','me'],['/test-auth/devices','devices']]);
 const writes=new Map([['/test-auth/logout','logout'],['/test-auth/logout-all','logoutAll'],['/test-auth/revoke-device','revokeDevice']]);
 return async function route(req){
  const path=req?.path;
  const headers=req?.headers||{};
  const cookie=headers.cookie||'';
  if(reads.has(path)){
   if(req.method!=='GET')return {status:405,body:{error:'method_not_allowed'}};
   if(headers.origin&&headers.origin!==trustedOrigin)return {status:403,body:{error:'origin_denied'}};
   if(headers['sec-fetch-site']&&headers['sec-fetch-site']!=='same-origin')return {status:403,body:{error:'cross_site_denied'}};
   return api[reads.get(path)](cookie);
  }
  if(path!=='/test-auth/login'&&!writes.has(path))return {status:404,body:{error:'not_found'}};
  const guard=checkAuthRequest(req,{trustedOrigin});
  if(!guard.ok)return {status:guard.status,body:{error:guard.error}};
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body))return {status:400,body:{error:'invalid_request'}};
  if(path==='/test-auth/login')return login(req);
  if(path==='/test-auth/revoke-device')return api.revokeDevice(cookie,body.sessionId);
  return api[writes.get(path)](cookie);
 };
}
