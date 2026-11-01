import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cookieHash,cookieValue,cookieHeader,readCookie,sanitizeIntake,submitIntake,
 caseStatus,listCases,changeCase,enabled} from '../mio-cookie-loss-intake-core.js';
const read=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
const token='a'.repeat(64),id='11111111-1111-4111-8111-111111111111',op='b'.repeat(32);
const person={name:'元の登録名',mioId:'MIO-0010',previousBrowser:'line'};
test('strictly opt-in; no migration or credentials are performed by default',()=>{
 assert.equal(enabled({}),false);
 assert.equal(enabled({MIO_COOKIE_LOSS_INTAKE_RELEASE:'enabled'}),false);
 assert.equal(enabled({MIO_COOKIE_LOSS_INTAKE_RELEASE:'reviewed-cookie-loss-intake-20261031'}),true);
});
test('anonymous browser token is random and only ever used for a private support case',()=>{
 const random=cookieValue();assert.match(random,/^[a-f0-9]{64}$/);
 assert.notEqual(random,cookieValue());
 assert.equal(readCookie(cookieHeader(token)),token);
 assert.equal(readCookie('mio_session=another; '+cookieHeader(token)),token);
 assert.equal(readCookie(COOKIE_STALE),null);
 assert.notEqual(cookieHash(token),cookieHash('c'.repeat(64)));
 assert.ok(cookieHeader(token).includes('HttpOnly'));
 assert.ok(cookieHeader(token).includes('Secure'));
 assert.ok(cookieHeader(token).includes('SameSite=Lax'));
 assert.ok(!cookieHeader(token).includes('mio_session='));
});
const COOKIE_STALE='mio_session=invalid; foo=bar';
test('claimed name is always unverified and no arbitrary control properties accepted',()=>{
 const p=sanitizeIntake(person);
 assert.equal(p.name,person.name);assert.equal(p.mioId,person.mioId);
 assert.throws(()=>sanitizeIntake({...person,name:''}));
 assert.throws(()=>sanitizeIntake({...person,name:'<script>'}));
 assert.throws(()=>sanitizeIntake({...person,previousBrowser:'webkit-copied'}));
 assert.throws(()=>sanitizeIntake({...person,approved:true}));
 assert.equal(sanitizeIntake({...person,mioId:''}).mioId,'');
});
test('browser-owned support case is one-shot and does not create participant',async()=>{
 let captured;
 const db={query:async(sql,args)=>{captured={sql,args};return {rowCount:1,rows:[{request_id:id}]}}};
 assert.deepEqual(await submitIntake(db,person,token),{ok:true,status:'submitted'});
 assert.match(captured.sql,/ON CONFLICT \(browser_proof_hash\) DO NOTHING/);
 assert.match(captured.sql,/now\(\)\+interval '24 hours'/);
 assert.equal(captured.args.includes(token),false);
 assert.equal(captured.args.includes(cookieHash(token)),true);
 const rejected={query:async()=>({rowCount:0,rows:[]})};
 await assert.rejects(submitIntake(rejected,person,token),/already submitted/);
});
test('only this browser proof can read the minimal case status',async()=>{
 const db={query:async(_sql,args)=>({rows:args[0]===cookieHash(token)?[{state:'reviewing'}]:[]})};
 assert.deepEqual(await caseStatus(db,token),{ok:true,status:'reviewing'});
 assert.deepEqual(await caseStatus(db,null),{ok:true,status:'none'});
 assert.deepEqual(await caseStatus(db,'c'.repeat(64)),{ok:true,status:'none'});
});
test('admin list always labels claimed ID unverified and login disabled',async()=>{
 const db={query:async()=>({rows:[{request_id:id,claimed_name:'試験',
  claimed_mio_id:'MIO-0010',previous_browser:'x',state:'submitted',
  requested_at:new Date(),expires_at:new Date()}]})};
 const items=await listCases(db);
 assert.equal(items.length,1);
 assert.equal(items[0].identityVerified,false);
 assert.equal(items[0].loginEnabled,false);
 assert.equal(items[0].claimedMioId,'MIO-0010');
});
function mockCase(){
 const st={state:'submitted',review_operation_id:null,review_transition:null},
   audit=new Map(),calls=[];
 return {st,calls,audit,async query(sql,args=[]){
  calls.push({sql,args});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
  if(sql.includes('SELECT state,review_operation_id'))
   return {rowCount:1,rows:[{...st}]};
  if(sql.includes('SELECT request_id,transition FROM mio_cookie_loss_audit')){
   const a=audit.get(args[0]);return a?{rowCount:1,rows:[a]}:{rowCount:0,rows:[]};
  }
  if(sql.includes('UPDATE mio_cookie_loss_cases')){
   if(st.state!==args[4])return {rowCount:0,rows:[]};
   st.state=args[1];st.review_operation_id=args[2];st.review_transition=args[3];
   return {rowCount:1,rows:[{request_id:args[0]}]};
  }
  if(sql.includes('INSERT INTO mio_cookie_loss_audit')){
   audit.set(args[0],{request_id:args[1],transition:args[3]});
   return {rowCount:1,rows:[]};
  }
  throw Error('unexpected SQL');
 }};
}
test('admin triage updates only support ticket, and identical operation cannot execute twice',async()=>{
 const db=mockCase();
 const d={requestId:id,operationId:op,expectedState:'submitted',nextState:'reviewing'};
 assert.deepEqual(await changeCase(db,d,'admin-passkey'),{status:'reviewing',replayed:false});
 assert.deepEqual(await changeCase(db,d,'admin-passkey'),{status:'reviewing',replayed:true});
 assert.equal(db.calls.filter(x=>x.sql.includes('UPDATE mio_cookie_loss_cases')).length,1);
 assert.equal(db.audit.size,1);
 assert.equal(db.st.state,'reviewing');
 await assert.rejects(changeCase(db,{...d,operationId:'c'.repeat(32)},'admin-passkey'),/state changed/);
 assert.equal(db.st.state,'reviewing');
});
test('admin review never upgrades an anonymous case to verified/approved login',async()=>{
 const db=mockCase();
 await assert.rejects(changeCase(db,{requestId:id,operationId:op,expectedState:'submitted',
  nextState:'approved'},'admin-code'));
 await assert.rejects(changeCase(db,{requestId:id,operationId:op,expectedState:'submitted',
  nextState:'reviewing'},'anonymous'));
 assert.equal(db.calls.length,0);
});
test('isolation: no new user identity, cookie mint, GAS draw, grant, or registration writes',()=>{
 const server=read('api-mio-cookie-loss-client.js')+'\n'+read('api-mio-cookie-loss-admin.js');
 const core=read('mio-cookie-loss-intake-core.js');
 const sql=read('db/mio-cookie-loss-cases-20261031.sql');
 const page=read('gacha.html'),gate=read('gacha-web-gate.html');
 const json=JSON.parse(read('vercel.json'));
 assert.doesNotMatch(server+core,/makeIdentity\(|sessionCookie\(|setLightSessionCookie\(|bridge\(['"](?:draw|register)/);
 assert.doesNotMatch(sql,/UPDATE\s+emuzii_|INSERT INTO mio_registration_v2|DROP TABLE|ALTER TABLE mio_registration_v2/i);
 assert.match(sql,/identity_verified boolean NOT NULL DEFAULT false CHECK \(identity_verified=false\)/);
 assert.match(sql,/login_enabled boolean NOT NULL DEFAULT false CHECK \(login_enabled=false\)/);
 assert.match(server,/authorizedCode/);
 assert.match(server,/sessionOK/);
 assert.match(server,/SAME_ORIGIN_REQUIRED/);
 assert.match(page,/id="cookieLossPanel"/);
 assert.match(gate,/id="cookieLossAdminPanel"/);
 for(const route of ['/api/mio-cookie-loss-client','/api/mio-cookie-loss-admin'])
  assert.equal(json.routes.filter(x=>x.src===route).length,1);
});
