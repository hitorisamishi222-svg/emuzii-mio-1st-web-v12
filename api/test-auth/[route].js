import {Pool} from 'pg';
import {createAuthApiHandlers} from '../../security/mio-auth-api-adapter.mjs';
import {createTestHttpRouter} from '../../security/mio-test-http-router.mjs';
import {testAuthDeploymentGate} from '../../security/mio-test-deployment-gate.mjs';
import {createHash} from 'node:crypto';
const pool=new Pool({connectionString:process.env.MIO_TEST_DATABASE_URL,max:3,connectionTimeoutMillis:5000});
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const gate=testAuthDeploymentGate(process.env);
 if(!gate.ok)return res.status(503).json({error:'test_environment_not_ready'});
 const host=String(req.headers.host||'');
 if(!/^emuzii-mio-1st-web-v12-68vp-[a-z0-9-]+\.vercel\.app$/.test(host))return res.status(403).json({error:'invalid_host'});
 const trustedOrigin='https://'+host;
 const path='/test-auth/'+String(req.query?.route||'');
 if(!['/test-auth/me','/test-auth/devices','/test-auth/login','/test-auth/logout','/test-auth/logout-all','/test-auth/revoke-device'].includes(path))return res.status(404).json({error:'not_found'});
 const contentLength=Number(req.headers['content-length']||0);
 if(contentLength>4096||JSON.stringify(req.body||{}).length>4096)return res.status(413).json({error:'payload_too_large'});
 const throttle={allow:async(key)=>{
  const digest=createHash('sha256').update(key).digest('hex');
  const result=await pool.query("INSERT INTO mio_test_login_limits(attempt_key,attempts,window_start) VALUES($1,1,now()) ON CONFLICT(attempt_key) DO UPDATE SET attempts=CASE WHEN mio_test_login_limits.window_start < now()-interval '15 minutes' THEN 1 ELSE mio_test_login_limits.attempts+1 END, window_start=CASE WHEN mio_test_login_limits.window_start < now()-interval '15 minutes' THEN now() ELSE mio_test_login_limits.window_start END RETURNING attempts", [digest]);
  return result.rows[0].attempts<=8;
 }};
 const api=createAuthApiHandlers(pool);
 const route=createTestHttpRouter({api,throttle,trustedOrigin});
 try{
  const response=await route({path,method:req.method,headers:req.headers,body:req.body,trustedClientIp:String(req.headers['x-vercel-forwarded-for']||req.headers['x-real-ip']||'').split(',')[0].trim()});
  for(const [k,v] of Object.entries(response.headers||{}))res.setHeader(k,v);
  return res.status(response.status).json(response.body);
 }catch{return res.status(503).json({error:'test_api_unavailable'})}
}
