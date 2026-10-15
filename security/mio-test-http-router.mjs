// Framework-neutral TEST auth router. Hosting must enforce byte limits and trustedClientIp.
import {checkAuthRequest} from './mio-auth-request-guard.mjs';
import {createLoginRoute} from './mio-login-route.mjs';
export function createTestHttpRouter({api,throttle,trustedOrigin,passkeys}={}){
 if(!api||['login','me','devices','logout','logoutAll','revokeDevice'].some(k=>typeof api[k]!=='function'))throw Error('complete auth API required');
 const login=createLoginRoute({api,throttle,trustedOrigin});
 const reads=new Map([['/test-auth/me','me'],['/test-auth/devices','devices']]);
 const writes=new Map([['/test-auth/logout','logout'],['/test-auth/logout-all','logoutAll'],['/test-auth/revoke-device','revokeDevice']]);
 const passkeyPaths=new Set(['/test-auth/passkey-register-options','/test-auth/passkey-register-verify','/test-auth/passkey-login-options','/test-auth/passkey-login-verify']);
 return async function route(req){
  const path=req?.path,headers=req?.headers||{},cookie=headers.cookie||'';
  if(reads.has(path)){
   if(req.method!=='GET')return {status:405,body:{error:'method_not_allowed'}};
   if((headers.origin&&headers.origin!==trustedOrigin)||(headers['sec-fetch-site']&&headers['sec-fetch-site']!=='same-origin')||(!headers.origin&&headers['sec-fetch-site']!=='same-origin'))return {status:403,body:{error:'origin_denied'}};
   return api[reads.get(path)](cookie);
  }
  if(path!=='/test-auth/login'&&!writes.has(path)&&!passkeyPaths.has(path))return {status:404,body:{error:'not_found'}};
  const guard=checkAuthRequest(req,{trustedOrigin,maxBodyBytes:passkeyPaths.has(path)?65536:4096});
  if(!guard.ok)return {status:guard.status,body:{error:guard.error}};
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body))return {status:400,body:{error:'invalid_request'}};
  if(passkeyPaths.has(path)){
   if(!passkeys)return {status:503,body:{error:'passkey_not_configured'}};
   const isLogin=path.includes('passkey-login-');
   if(isLogin&&throttle&&typeof throttle.allow==='function'&&!await throttle.allow('passkey:'+String(req.trustedClientIp||'unknown')))return {status:429,body:{error:'too_many_attempts'}};
   if(path.endsWith('passkey-register-options')||path.endsWith('passkey-register-verify')){
    const session=await api.me(cookie);
    if(session.status!==200)return {status:401,body:{error:'unauthorized'}};
    if(path.endsWith('passkey-register-options'))return passkeys.registrationOptions(session.body.accountId);
    if(typeof body.challengeId!=='string'||body.challengeId.length>64||!body.response)return {status:400,body:{error:'invalid_request'}};
    return passkeys.verifyRegistration(session.body.accountId,body);
   }
   if(path.endsWith('passkey-login-options')){
    if(typeof body.identifier!=='string'||body.identifier.length>100)return {status:400,body:{error:'invalid_request'}};
    return passkeys.authenticationOptions(body.identifier);
   }
   if(typeof body.challengeId!=='string'||body.challengeId.length>64||!body.response||
      (body.deviceLabel!==undefined&&(typeof body.deviceLabel!=='string'||body.deviceLabel.length>80)))return {status:400,body:{error:'invalid_request'}};
   return passkeys.verifyAuthentication(body,body.deviceLabel||'端末');
  }
  if(path==='/test-auth/login'){
   if(typeof body.identifier!=='string'||body.identifier.length>100||typeof body.password!=='string'||body.password.length>1024||
    (body.deviceLabel!==undefined&&(typeof body.deviceLabel!=='string'||body.deviceLabel.length>80)))return {status:400,body:{error:'invalid_request'}};
   return login(req);
  }
  const session=await api.me(cookie);
  if(session.status!==200)return {status:401,body:{error:'unauthorized'}};
  if(path==='/test-auth/revoke-device'){
   if(typeof body.sessionId!=='string'||!/^[0-9a-f]{64}$/.test(body.sessionId))return {status:400,body:{error:'invalid_session'}};
   return api.revokeDevice(cookie,body.sessionId);
  }
  return api[writes.get(path)](cookie);
 };
}
