// Server-only route orchestrator. No public endpoint is created here.
// Inject durable rate limiting and authenticated PostgreSQL-backed handlers.
import {checkAuthRequest} from './mio-auth-request-guard.mjs';
export function createLoginRoute({api,throttle,trustedOrigin}={}){
 if(!api||typeof api.login!=='function')throw Error('login API required');
 if(!throttle||typeof throttle.allow!=='function')throw Error('shared throttle required');
 return async function handle(request){
  const guard=checkAuthRequest(request,{trustedOrigin});
  if(!guard.ok)return {status:guard.status,body:{error:guard.error}};
  const body=request.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.identifier!=='string'||!body.identifier.trim()||typeof body.password!=='string'||!body.password)return {status:400,body:{error:'invalid_request'}};
  // Client IP must come from a trusted reverse proxy, not user-controlled headers.
  if(typeof request.trustedClientIp!=='string'||!request.trustedClientIp.trim())return {status:503,body:{error:'security_configuration_required'}};
  const key=request.trustedClientIp+'|'+body.identifier.trim().toLowerCase();
  const allowed=await throttle.allow(key);
  if(!allowed)return {status:429,headers:{'Cache-Control':'no-store','Retry-After':'900'},body:{error:'too_many_attempts'}};
  return api.login(body);
 };
}
