import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sender=read('GAS_EventEmailOtp_20261101.gs');
const original=read('GAS_Code_FULL_WEB_OPS_20261030.gs');
const challenge='11111111-1111-4111-8111-111111111111';
function setup(flag='reviewed-event-email-send-20261101',quota=100){
 const sent=[],cache=new Map(),ctx={
  PropertiesService:{getScriptProperties(){return {getProperty(k){return k==='MIO_EVENT_EMAIL_OTP_GAS_ENABLED'?flag:null}}}},
  MailApp:{getRemainingDailyQuota(){return quota},sendEmail(...args){sent.push(args)}},
  Utilities:{
   DigestAlgorithm:{SHA_256:'SHA_256'},
   computeDigest(_,input){return [...Buffer.from(input,'utf8')]},
   base64EncodeWebSafe(bytes){return Buffer.from(bytes).toString('base64url')}
  },
  CacheService:{getScriptCache(){return {get(k){return cache.get(k)},put(k,v,ttl){cache.set(k,v);ctx.ttl=ttl}}}}
 };
 vm.runInNewContext(sender,ctx);
 return {send:d=>JSON.parse(JSON.stringify(ctx.mioEventEmailOtpSend_(d))),sent,cache,ctx};
}
test('candidate sender is disabled by default and does not send mail',()=>{
 const s=setup(null);
 assert.deepEqual(s.send({email:'viewer@gmail.com',code:'123456',challengeId:challenge}),
  {ok:false,sent:false,error:'email sender disabled'});
 assert.equal(s.sent.length,0);
});
test('GAS candidate sends to exactly validated recipient, never a nominated redirect',()=>{
 const s=setup();
 assert.deepEqual(s.send({email:'VIEWER@gmail.com',code:'123456',challengeId:challenge}),
  {ok:true,sent:true});
 assert.equal(s.sent.length,1);
 assert.equal(s.sent[0][0],'viewer@gmail.com');
 assert.match(s.sent[0][2],/123456/);
 assert.equal(s.ctx.ttl,90);
 assert.equal(s.send({email:'viewer@gmail.com',code:'999999',challengeId:challenge}).sent,false);
 assert.equal(s.sent.length,1);
});
test('reject invalid email, invalid OTP, header injection and exhausted MailApp quota',()=>{
 const s=setup();
 for(const data of [
  {email:'viewer@gmail.com\nBcc:someone@example.com',code:'123456'},
  {email:'viewer@gmail.com,other@gmail.com',code:'123456'},
  {email:'viewer@gmail.com',code:'12'},
  {email:'viewer@gmail.com',code:'1234567'}
 ])assert.equal(s.send({...data,challengeId:challenge}).sent,false);
 assert.equal(s.sent.length,0);
 assert.equal(setup('reviewed-event-email-send-20261101',0).send({
  email:'viewer@gmail.com',code:'123456',challengeId:challenge
 }).sent,false);
});
test('existing doPost still requires BRIDGE_SECRET before proposed dispatcher',()=>{
 const secretIndex=original.indexOf("if(!secret||!equal_(d.secret,secret))");
 const identityIndex=original.indexOf("if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId");
 assert.ok(secretIndex>=0&&identityIndex>secretIndex);
 assert.doesNotMatch(original,/mioEventEmailOtpSend_/);
 assert.match(sender,/BEFORE participantId\/tokenHash validation/);
 assert.match(sender,/MIO_EVENT_EMAIL_OTP_GAS_ENABLED/);
 assert.match(sender,/MailApp\.sendEmail/);
 assert.doesNotMatch(sender,/SpreadsheetApp|gachaAction_|setValue\(|openById\(/);
});
