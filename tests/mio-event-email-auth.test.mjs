import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enabled,normalizeEmail,emailLookup,browserHash,ipHash,otpDigest,
 createPendingToken,pendingCookie,readPendingCookie,startEmailChallenge,
 finishEmailChallenge,invalidateUnsent} from '../mio-event-email-auth-core.js';
import {readVerifiedEmailCookie} from '../mio-event-pass-core.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const key='x'.repeat(64),sessionKey='q'.repeat(64),token='b'.repeat(64);
const subject='11111111-1111-4111-8111-111111111111';
function mock(){
 const calls=[],state={sent:false,codeDigest:null,id:null,lookup:null,attempts:0,
  status:'pending',emailCount:0,ipCount:0,verified:false};
 const db={calls,state,async query(sql,args=[]){
  calls.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock'))
   return {rowCount:0,rows:[]};
  if(sql.includes('COUNT(*) FILTER')){
   return {rowCount:1,rows:[{email_count:state.emailCount,ip_count:state.ipCount}]};
  }
  if(sql.includes("SET state='superseded'"))return {rowCount:0,rows:[]};
  if(sql.includes('INSERT INTO mio_event_email_challenges')){
   state.id=args[0];state.lookup=args[1];state.codeDigest=args[4];
   return {rowCount:1,rows:[{challenge_id:args[0]}]};
  }
  if(sql.includes("SET state='send_failed'")){state.status='send_failed';return {rowCount:1,rows:[]};}
  if(sql.includes('SELECT challenge_id,email_lookup,code_digest,attempts')){
   return state.status==='pending'?{rowCount:1,rows:[{
    challenge_id:state.id,email_lookup:state.lookup,code_digest:state.codeDigest,
    attempts:state.attempts
   }]}:{rowCount:0,rows:[]};
  }
  if(sql.includes('SET attempts=attempts+1')){
   state.attempts++;if(state.attempts>=5)state.status='locked';
   return {rowCount:1,rows:[]};
  }
  if(sql.includes("SET state='verified'")){state.status='verified';return {rowCount:1,rows:[]};}
  if(sql.includes('INSERT INTO mio_event_email_subjects')){
   state.verified=true;return {rowCount:1,rows:[{subject_id:subject}]};
  }
  throw Error('unknown SQL: '+sql.slice(0,100));
 }};
 return db;
}
test('OTP endpoint is strictly opt-in and refuses unverified release flags',()=>{
 assert.equal(enabled({}),false);
 assert.equal(enabled({MIO_EVENT_EMAIL_OTP_RELEASE:'enabled'}),false);
 assert.equal(enabled({MIO_EVENT_EMAIL_OTP_RELEASE:'verified-event-email-otp-20261101'}),true);
});
test('common free email addresses are accepted but never imply unique real-world person',()=>{
 for(const addr of [' User.Name+event@gmail.com ','friend@yahoo.co.jp','hello@icloud.com'])
  assert.ok(normalizeEmail(addr).includes('@'));
 for(const addr of ['a','a@localhost','foo bar@example.com','a@example..com','a@example.com\nBcc:x'])
  assert.throws(()=>normalizeEmail(addr));
 assert.equal(normalizeEmail(' User+Event@GMAIL.com '),'user+event@gmail.com');
});
test('browser pending token is isolated from MIO and event session cookies',()=>{
 const t=createPendingToken(),cookie=pendingCookie(t);
 assert.notEqual(t,createPendingToken());
 assert.equal(readPendingCookie(cookie),t);
 assert.equal(readPendingCookie('mio_session=x; '+cookie),t);
 assert.equal(readPendingCookie('mio_session=x'),null);
 for(const a of ['HttpOnly','Secure','SameSite=Lax','Max-Age=600'])assert.ok(cookie.includes(a));
 assert.ok(!cookie.includes('mio_light_session'));
});
test('no plaintext addresses or 6-digit codes are stored in challenge DB',async()=>{
 const db=mock();
 const made=await startEmailChallenge(db,{email:'test@example.com',token,ip:'203.0.113.42',secret:key});
 assert.equal(made.email,'test@example.com');
 assert.match(made.code,/^[0-9]{6}$/);
 const sql=db.calls.find(x=>x.sql.includes('INSERT INTO mio_event_email_challenges'));
 assert.equal(sql.args.includes('test@example.com'),false);
 assert.equal(sql.args.includes(made.code),false);
 assert.equal(sql.args[1],emailLookup('test@example.com',key));
 assert.equal(sql.args[3],browserHash(token,key));
 assert.equal(sql.args[4],otpDigest(made.challengeId,made.code,key));
 assert.notEqual(ipHash('203.0.113.42',key),'203.0.113.42');
});
test('rate limits serialize both recipient and IP keys and supersede older browser codes',async()=>{
 const d=mock();
 const r=await startEmailChallenge(d,{email:'one@gmail.com',token,ip:'198.51.100.12',secret:key});
 assert.ok(r.challengeId);
 const locks=d.calls.filter(x=>x.sql.includes('pg_advisory_xact_lock'));
 assert.equal(locks.length,2);
 assert.match(locks[0].args[0],/^email:/);
 assert.match(locks[1].args[0],/^ip:/);
 const supersede=d.calls.find(x=>x.sql.includes("SET state='superseded'"));
 assert.ok(supersede);
 assert.equal(supersede.args[0],browserHash(token,key));
 assert.ok(d.calls.indexOf(supersede)<d.calls.findIndex(x=>x.sql.includes('INSERT INTO mio_event_email_challenges')));
});
test('database-backed recipient and IP hourly limits reject repeated sending',async()=>{
 const db=mock();db.state.emailCount=3;
 await assert.rejects(startEmailChallenge(db,{email:'test@example.com',token,ip:'203.0.113.1',secret:key}),/rate limit/);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 const db2=mock();db2.state.ipCount=12;
 await assert.rejects(startEmailChallenge(db2,{email:'someone@example.com',token,ip:'203.0.113.1',secret:key}),/rate limit/);
 assert.equal(db2.calls.filter(x=>x.sql.includes('INSERT INTO mio_event_email_challenges')).length,0);
});
test('wrong OTP increments attempts; correct OTP gives one signed, preverified email subject',async()=>{
 const db=mock();
 const made=await startEmailChallenge(db,{email:'test@example.com',token,ip:'203.0.113.2',secret:key});
 const wrong=made.code==='000000'?'000001':'000000';
 assert.deepEqual(await finishEmailChallenge(db,{token,otp:wrong,secret:key,sessionSecret:sessionKey}),{verified:false});
 assert.equal(db.state.attempts,1);
 const verified=await finishEmailChallenge(db,{token,otp:made.code,secret:key,sessionSecret:sessionKey});
 assert.equal(verified.verified,true);
 assert.deepEqual(readVerifiedEmailCookie(verified.sessionCookie,sessionKey)?.subjectId,subject);
 assert.equal(db.state.status,'verified');
 await assert.rejects(finishEmailChallenge(db,{token,otp:made.code,secret:key,sessionSecret:sessionKey}),/expired/);
});
test('five wrong OTP attempts lock this browser challenge',async()=>{
 const db=mock();
 await startEmailChallenge(db,{email:'test@example.com',token,ip:'203.0.113.5',secret:key});
 for(let i=0;i<5;i++){
  const d=await finishEmailChallenge(db,{token,otp:'x'.repeat(6).replaceAll('x',String(i)),secret:key,sessionSecret:sessionKey});
  assert.equal(d.verified,false);
 }
 assert.equal(db.state.attempts,5);
 assert.equal(db.state.status,'locked');
 await assert.rejects(finishEmailChallenge(db,{token,otp:'123456',secret:key,sessionSecret:sessionKey}),/expired/);
});
test('mail relay failure marks challenge unusable, does not issue email session',async()=>{
 const db=mock();
 const made=await startEmailChallenge(db,{email:'test@example.com',token,ip:'203.0.113.5',secret:key});
 await invalidateUnsent(db,made.challengeId);
 assert.equal(db.state.status,'send_failed');
 await assert.rejects(finishEmailChallenge(db,{token,otp:made.code,secret:key,sessionSecret:sessionKey}),/expired/);
});
test('existing GAS sender is proposal-only, no MIO registration or gacha mutation',()=>{
 const api=read('api-mio-event-email.js'),core=read('mio-event-email-auth-core.js'),
  gas=read('GAS_EventEmailOtp_20261101.gs'),original=read('GAS_Code_FULL_WEB_OPS_20261030.gs'),
  db=read('db/mio-event-pass-20261101.sql');
 assert.match(api,/bridge\('eventEmailOtpSend'/);
 assert.match(api,/readPendingCookie\(req.headers.cookie/);
 assert.match(api,/EMAIL_VERIFICATION_DISABLED/);
 assert.match(api,/verified:true|result.verified/);
 assert.match(gas,/MailApp.sendEmail/);
 assert.match(gas,/getRemainingDailyQuota/);
 assert.match(gas,/MIO_EVENT_EMAIL_OTP_GAS_ENABLED/);
 assert.doesNotMatch(original,/mioEventEmailOtpSend_/);
 assert.match(db,/mio_event_email_challenges/);
 assert.doesNotMatch(api+core+gas,/makeIdentity\(|sessionCookie\(|setLightSessionCookie\(|webAdminOpsGrant|gachaAction_\(/);
});
