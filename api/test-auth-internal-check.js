import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../security/mio-auth-crypto.mjs';
import {createAuthApiHandlers} from '../security/mio-auth-api-adapter.mjs';
import {testAuthDeploymentGate} from '../security/mio-test-deployment-gate.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
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
  const ok=extraOk&&login.status===200&&me.status===200&&devices.status===200&&devices.body.devices.length===1&&revoke.status===200&&revoke.body.revoked===true&&after.status===401;
  return res.status(ok?200:503).json({status:ok?'ok':'failed',checks:{login:login.status===200,me:me.status===200,devices:devices.status===200,revoke:revoke.body?.revoked===true,expired:after.status===401,logoutAll:all.status===200&&allExpired.status===401,logout:out.status===200&&outExpired.status===401}});
 }catch(e){return res.status(503).json({status:'failed',error:'test_execution_failed'})}
 finally{if(created)await pool.query('DELETE FROM mio_sessions_v21 WHERE account_id=$1',[id]).catch(()=>{});if(created)await pool.query('DELETE FROM mio_identifiers_v21 WHERE account_id=$1',[id]).catch(()=>{});if(created)await pool.query('DELETE FROM mio_accounts_v21 WHERE account_id=$1',[id]).catch(()=>{});await pool.end()}
}
