import {Pool} from 'pg';
import authHandler from './test-auth/[route].js';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../security/mio-auth-crypto.mjs';
import {createAuthApiHandlers} from '../security/mio-auth-api-adapter.mjs';
import {createTestHttpRouter} from '../security/mio-test-http-router.mjs';
import {testAuthDeploymentGate} from '../security/mio-test-deployment-gate.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 if(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')return res.status(403).json({error:'cross_site_denied'});
 if(!testAuthDeploymentGate(process.env).ok)return res.status(503).json({status:'disabled'});
 const pool=new Pool({connectionString:process.env.MIO_TEST_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
 const id=randomUUID(), loginId='test_'+id.replaceAll('-','').slice(0,12),password='T!'+randomUUID()+randomUUID();
 let created=false;
 try{
  const hash=await hashPassword(password);
  await pool.query('INSERT INTO mio_accounts_v21(account_id,mio_id,login_id,password_hash) VALUES($1,$2,$3,$4)',[id,'test-'+id,loginId,hash]);created=true;
  await pool.query("INSERT INTO mio_identifiers_v21(identifier_key,account_id,kind) VALUES($1,$2,'login_id')",[loginId,id]);
  const api=createAuthApiHandlers(pool);
  const login=await api.login({identifier:loginId,password,deviceLabel:'TEST-A'});
  const cookie=login.headers?.['Set-Cookie']?.split(';')[0]||'';
  const me=await api.me(cookie);
  const devices=await api.devices(cookie);
  const revoke=await api.revokeDevice(cookie,devices.body?.devices?.[0]?.sessionId);
  const after=await api.me(cookie);
  const second=await api.login({identifier:loginId,password,deviceLabel:'TEST-B'});
  const secondCookie=second.headers?.['Set-Cookie']?.split(';')[0]||'';
  const all=await api.logoutAll(secondCookie);
  const allExpired=await api.me(secondCookie);
  const third=await api.login({identifier:loginId,password,deviceLabel:'TEST-C'});
  const thirdCookie=third.headers?.['Set-Cookie']?.split(';')[0]||'';
  const out=await api.logout(thirdCookie);
  const outExpired=await api.me(thirdCookie);
  const extraOk=second.status===200&&all.status===200&&all.body.revoked===1&&allExpired.status===401&&third.status===200&&out.status===200&&outExpired.status===401;
  const origin='https://emuzii-mio-1st-web-v12-68vp-test.vercel.app';
  const router=createTestHttpRouter({api,throttle:{allow:async()=>true},trustedOrigin:origin});
  const request={path:'/test-auth/login',method:'POST',headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin'},trustedClientIp:'127.0.0.1',body:{identifier:loginId,password,deviceLabel:'TEST-HTTP'}};
  const rejectedOrigin=await router({...request,headers:{...request.headers,origin:'https://evil.example'}});
  const rejectedType=await router({...request,headers:{...request.headers,'content-type':'text/plain'}});
  const rejectedIp=await router({...request,trustedClientIp:''});
  const rejectedMethod=await router({...request,method:'GET'});
  const accepted=await router(request);
  const httpCookie=accepted.headers?.['Set-Cookie']?.split(';')[0]||'';
  const httpMe=await router({path:'/test-auth/me',method:'GET',headers:{cookie:httpCookie}});
  const httpDevices=await router({path:'/test-auth/devices',method:'GET',headers:{cookie:httpCookie}});
  const httpLogout=await router({path:'/test-auth/logout',method:'POST',headers:{...request.headers,cookie:httpCookie},body:{}});
  const httpExpired=await router({path:'/test-auth/me',method:'GET',headers:{cookie:httpCookie}});
  const deniedCrossSite=await router({...request,headers:{...request.headers,'sec-fetch-site':'cross-site'}});
  const deniedMissingOrigin=await router({...request,headers:{'content-type':'application/json','sec-fetch-site':'same-origin'}});
  const deniedOversize=await router({...request,headers:{...request.headers,'content-length':'99999'}});
  const deniedThrottle=await createTestHttpRouter({api,throttle:{allow:async()=>false},trustedOrigin:origin})(request);
  const setCookie=String(accepted.headers?.['Set-Cookie']||'');
  const cookieSafe=setCookie.includes('HttpOnly')&&setCookie.includes('Secure')&&setCookie.includes('SameSite=Lax')&&setCookie.startsWith('__Host-');
  const httpChecks={crossSite:deniedCrossSite.status===403,missingOrigin:deniedMissingOrigin.status===403,oversize:deniedOversize.status===413,throttle:deniedThrottle.status===429,cookieSecurity:cookieSafe,origin:rejectedOrigin.status===403,contentType:rejectedType.status===415,clientIp:rejectedIp.status===503,method:rejectedMethod.status===405,login:accepted.status===200,me:httpMe.status===200,devices:httpDevices.status===200,logout:httpLogout.status===200,expired:httpExpired.status===401};
  async function invokeHandler(route,method,headers={},body={}){
   let status=200, responseBody, responseHeaders={};
   const res={setHeader(k,v){responseHeaders[k]=v;return this},status(v){status=v;return this},json(v){responseBody=v;return this}};
   await authHandler({query:{route},method,headers:{host:'emuzii-mio-1st-web-v12-68vp-test.vercel.app',...headers},body},res);
   return {status,body:responseBody,headers:responseHeaders};
  }
  const handlerUnauth=await invokeHandler('me','GET');
  const handlerInvalidHost=await invokeHandler('me','GET',{host:'untrusted.example'});
  const handlerUnknown=await invokeHandler('unknown','GET');
  const handlerInvalidMethod=await invokeHandler('me','POST');
  const handlerOversize=await invokeHandler('login','POST',{'content-length':'99999'});
  const handlerChecks={unauthorized:handlerUnauth.status===401,host:handlerInvalidHost.status===403,unknown:handlerUnknown.status===404,method:handlerInvalidMethod.status===405,oversize:handlerOversize.status===413};
  const ok=Object.values(handlerChecks).every(Boolean)&&Object.values(httpChecks).every(Boolean)&&extraOk&&login.status===200&&me.status===200&&devices.status===200&&devices.body.devices.length===1&&revoke.status===200&&revoke.body.revoked===true&&after.status===401;
  return res.status(ok?200:503).json({status:ok?'ok':'failed',checks:{login:login.status===200,me:me.status===200,devices:devices.status===200,revoke:revoke.body?.revoked===true,expired:after.status===401,logoutAll:all.status===200&&allExpired.status===401,logout:out.status===200&&outExpired.status===401},httpChecks,handlerChecks});
 }catch(e){return res.status(503).json({status:'failed',error:'test_execution_failed'})}
 finally{if(created)await pool.query('DELETE FROM mio_sessions_v21 WHERE account_id=$1',[id]).catch(()=>{});if(created)await pool.query('DELETE FROM mio_identifiers_v21 WHERE account_id=$1',[id]).catch(()=>{});if(created)await pool.query('DELETE FROM mio_accounts_v21 WHERE account_id=$1',[id]).catch(()=>{});await pool.end()}
}
