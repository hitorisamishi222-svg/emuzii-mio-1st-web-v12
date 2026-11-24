import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVEL,RESOURCE,effectiveLevel,canUse,authorizedFeature,safeName,
 validMaster,issuerOwned,trustedRosterBinding,verifiedMemberGrant,
 issueCode,codeDigest,verifiedDevice} from '../mio-level-access-vnext.mjs';
import {issuerRegisterAccess,claimIssuedAccess,checkAccess,accessTransaction} from '../mio-level-registration-vnext.mjs';

const pepper='mio-vnext-unit-test-only-pepper-not-real-at-least-48-characters-long';
const issuer={owner_user_id:'mio-owner',active:true};
const actor={source:'server-session',role:'owner',userId:'mio-owner'};
const masterId='MIO-0017',name='ユーリ';
const rosterProof={source:'gas-verified',unique:true,masterId,displayName:name};
const memberEvidence={source:'server-owner-verified',active:true};
const proof={source:'server-verified-signature',fresh:true,
 fingerprint:'sha256:'+'f'.repeat(64)};
const now=new Date('2026-11-25T00:00:00Z');

const account=(level,member_until=null)=>({status:'active',level,member_until});
test('exact three-level resource matrix and public anonymous visitor',()=>{
 const list=Object.values(RESOURCE);
 const expected={
  1:[true,true,false,false,false,false],
  2:[true,true,true,true,false,false],
  3:[true,true,true,true,true,true]
 };
 for(const level of [1,2,3]){
  const a=account(level,level===3?'2026-12-31T00:00:00Z':null);
  assert.deepEqual(list.map(r=>canUse(a,r,now)),expected[level],String(level));
 }
 assert.equal(canUse(null,RESOURCE.SITE),true);
 assert.equal(canUse(null,RESOURCE.PUBLIC_GALLERY),true);
 assert.equal(canUse(null,RESOURCE.MEMBER_GACHA),false);
 assert.equal(canUse(account(3,'2026-11-01T00:00:00Z'),RESOURCE.MEMBER_GACHA,now),false);
 assert.equal(effectiveLevel(account(3,'2026-11-01T00:00:00Z'),now),2);
 assert.equal(canUse(account(3,'2026-11-01T00:00:00Z'),RESOURCE.FAN_GALLERY,now),true);
 assert.equal(canUse(account(3,'2026-12-31T00:00:00Z'),'secret_admin_page',now),false);
});
test('server device proof and signed session are required for protected resources',()=>{
 assert.equal(authorizedFeature({account:account(3,'2026-12-31'),resource:RESOURCE.MEMBER_GACHA,
  sessionValid:true,deviceProofVerified:true,now}),true);
 assert.equal(authorizedFeature({account:account(3,'2026-12-31'),resource:RESOURCE.MEMBER_GACHA,
  sessionValid:true,deviceProofVerified:false,now}),false);
 assert.equal(authorizedFeature({account:account(3,'2026-12-31'),resource:RESOURCE.MEMBER_GACHA,
  sessionValid:false,deviceProofVerified:true,now}),false);
 assert.equal(authorizedFeature({account:null,resource:RESOURCE.SITE}),true);
});
test('roster/master binding rejects nickname-only, cross-account and fake actor',()=>{
 assert.equal(safeName('　ユーリ　'),'ユーリ');assert.equal(validMaster(masterId),masterId);
 assert.equal(trustedRosterBinding(rosterProof,masterId,name),true);
 assert.throws(()=>trustedRosterBinding({...rosterProof,source:'browser'},masterId,name),/VERIFIED_ROSTER/);
 assert.throws(()=>trustedRosterBinding({...rosterProof,masterId:'MIO-0018'},masterId,name),/VERIFIED_ROSTER/);
 assert.throws(()=>trustedRosterBinding({...rosterProof,displayName:'別人'},masterId,name),/VERIFIED_ROSTER/);
 assert.equal(issuerOwned(actor,issuer),true);
 assert.throws(()=>issuerOwned({...actor,role:'listener'},issuer),/OWNER_AUTH_REQUIRED/);
 assert.throws(()=>issuerOwned({...actor,source:'client'},issuer),/OWNER_AUTH_REQUIRED/);
 assert.throws(()=>validMaster('MIO-W-fake'),/TRUSTED_MASTER_ID_REQUIRED/);
});
test('member expiration needs verified owner decision; never infer from nickname',()=>{
 assert.equal(verifiedMemberGrant(2,null,null,now),null);
 assert.equal(verifiedMemberGrant(3,'2026-12-31',memberEvidence,now).toISOString(),'2026-12-31T00:00:00.000Z');
 assert.throws(()=>verifiedMemberGrant(3,'2026-12-31',{source:'browser',active:true},now),/MEMBERSHIP/);
 assert.throws(()=>verifiedMemberGrant(3,'2026-10-01',memberEvidence,now),/MEMBERSHIP/);
});
test('random 160-bit issued IDs have unique peppered hashes and names are never passwords',()=>{
 const x=issueCode(pepper),y=issueCode(pepper);
 assert.match(x.code,/^MIO-ACCESS-[a-f0-9]{40}$/);assert.notEqual(x.code,y.code);
 assert.equal(codeDigest(x.code,pepper),x.codeHash);
 assert.notEqual(x.codeHash,x.code);
 assert.throws(()=>codeDigest('ユーリ',pepper),/INVALID_ACCESS_CODE/);
 assert.equal(verifiedDevice(proof),proof.fingerprint);
 assert.throws(()=>verifiedDevice({...proof,source:'browser-claimed'}),/DEVICE_SIGNATURE_REQUIRED/);
});
function fakeDB({existing=false,failInsert=false,invite=null,wrongName=false}={}){
 const calls=[],state={existing,failInsert,invite,accountSession:'original-session-is-untouched',rollback:false};
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){if(sql==='ROLLBACK')state.rollback=true;return {rows:[]}}
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[{}]};
  if(sql.includes('FROM mio_level_issuers_v1'))return {rows:[issuer]};
  if(sql.includes('FROM mio_level_accounts_v1 WHERE master_id'))return {rows:[{master_id:masterId,display_name:wrongName?'別人':name,generation:0,status:'active'}].filter(()=>state.existing)};
  if(sql.includes('FROM mio_level_audit_v1'))return {rows:[]};
  if(sql.startsWith("UPDATE mio_level_invites_v1 SET status='revoked'")){
   const prior=state.invite?.status==='issued'?[state.invite]:[];
   for(const row of prior)row.status='revoked';
   return {rows:prior};
  }
  if(sql.startsWith('INSERT INTO mio_level_accounts_v1')){state.existing=true;return {rows:[]}};
  if(sql.startsWith('INSERT INTO mio_level_invites_v1')){
   if(state.failInsert)throw Error('SYNTHETIC_INSERT_FAILURE');
   state.invite={invite_id:args[0],master_id:args[1],generation:args[3],code_hash:args[4],status:'issued',expires_at:args[6]};
   return {rows:[]};
  }
  if(sql.startsWith('SELECT master_id FROM mio_level_invites_v1')){
   return {rows:state.invite?.status==='issued'&&state.invite.code_hash===args[0]?[{master_id:masterId}]:[]};
  }
  if(sql.startsWith('SELECT invite_id,master_id,generation,expires_at FROM mio_level_invites_v1')){
   return {rows:state.invite?.status==='issued'&&state.invite.code_hash===args[0]?[state.invite]:[]};
  }
  if(sql.startsWith("UPDATE mio_level_invites_v1 SET status='claimed'")){
   if(state.invite?.status!=='issued')return {rows:[]};
   state.invite.status='claimed';return {rows:[{invite_id:state.invite.invite_id}]};
  }
  if(sql.startsWith('UPDATE mio_level_accounts_v1 SET status='))return {rows:[{master_id:masterId}]};
  return {rows:[]};
 };
 const pool={calls,state,query,async connect(){return {query,release(){calls.push({sql:'RELEASE'})}}}};
 return pool;
}
const issueArgs=(db,extra={})=>({db,actor,issuerId:'mio',masterId,displayName:name,level:2,
 rosterProof,pepper,now,operationId:'12345678-1234-4123-8123-123456789012',...extra});
test('owner issue writes invitation only, never rewrites gacha/attendance ledger',async()=>{
 const db=fakeDB();
 const r=await issuerRegisterAccess(issueArgs(db));
 assert.match(r.code,/^MIO-ACCESS-/);assert.equal(r.level,2);
 assert.equal(db.state.accountSession,'original-session-is-untouched');
 assert.ok(db.calls.some(c=>c.sql.startsWith('INSERT INTO mio_level_invites_v1')));
 assert.ok(db.calls.some(c=>c.sql==='COMMIT'));
 assert.equal(db.calls.filter(x=>/gacha|attendance|GAS/.test(x.sql)).length,0);
});
test('bad owner/roster proof cannot issue and fails closed',async()=>{
 const db=fakeDB();
 await assert.rejects(issuerRegisterAccess(issueArgs(db,{rosterProof:{...rosterProof,unique:false}})),/ROSTER_BINDING/);
 assert.equal(db.calls.length,0);
});
test('claim requires exact pre-approved name and device signature, then changes one device session',async()=>{
 const db=fakeDB({existing:true});
 const issued=await issuerRegisterAccess(issueArgs(db));
 const result=await claimIssuedAccess({db,displayName:name,code:issued.code,deviceProof:proof,
  deviceInfo:{browser:'Safari',os:'iOS'},pepper,now});
 assert.equal(result.masterId,masterId);
 assert.match(result.sessionToken,/^[a-f0-9]{64}$/);
 // The claim must serialize by master ID before locking a redeemable invite.
 assert.ok(db.calls.some(x=>x.sql.startsWith('UPDATE mio_level_accounts_v1 SET status=')));
 assert.equal(db.calls.filter(x=>/gacha|attendance/.test(x.sql)).length,0);
});
test('wrong name and reused issued ID reject without granting a new session',async()=>{
 const db=fakeDB({existing:true});
 const issued=await issuerRegisterAccess(issueArgs(db));
 await assert.rejects(claimIssuedAccess({db,displayName:'別人',code:issued.code,deviceProof:proof,pepper,now}),/NAME_OR_GENERATION_MISMATCH/);
 const bad=await checkAccess({db,resource:RESOURCE.MEMBER_GACHA,token:'a'.repeat(64),deviceProof:proof,pepper,now});
 assert.equal(bad.allowed,false);
});
test('Postgres transaction uses one acquired client and rolls back on failure',async()=>{
 const db=fakeDB({existing:true,failInsert:true});
 await assert.rejects(issuerRegisterAccess(issueArgs(db)),/SYNTHETIC_INSERT_FAILURE/);
 assert.equal(db.state.rollback,true);
 assert.equal(db.calls.filter(x=>x.sql==='BEGIN').length,1);
 assert.equal(db.calls.filter(x=>x.sql==='ROLLBACK').length,1);
 assert.equal(db.calls.filter(x=>x.sql==='RELEASE').length,1);
});
test('L1 visitor can read public gallery without signed browser session',async()=>{
 const db=fakeDB();
 assert.deepEqual(await checkAccess({db,resource:RESOURCE.SITE,token:null,deviceProof:null,pepper,now}),{allowed:true,level:1});
 assert.deepEqual(await checkAccess({db,resource:RESOURCE.PUBLIC_GALLERY,token:null,deviceProof:null,pepper,now}),{allowed:true,level:1});
});

test('reissue invalidates previous unused ID but preserves the active device session',async()=>{
 const db=fakeDB({existing:true});
 const first=await issuerRegisterAccess(issueArgs(db));
 const prior=db.state.invite;
 const second=await issuerRegisterAccess(issueArgs(db,{operationId:'12345678-1234-4123-8123-123456789013'}));
 assert.equal(prior.status,'revoked');
 assert.equal(db.state.invite.status,'issued');
 assert.notEqual(first.code,second.code);
 assert.equal(second.replacedCount,1);
 assert.equal(db.state.accountSession,'original-session-is-untouched');
 await assert.rejects(claimIssuedAccess({db,displayName:name,code:first.code,deviceProof:proof,pepper,now}),/INVALID_OR_USED_CODE/);
});

test('server protects protected room by current session and device, not UI visibility',async()=>{
 const {newSession}=await import('../mio-level-access-vnext.mjs');
 const c=newSession(pepper);
 const current={master_id:masterId,level:3,status:'active',member_until:'2026-12-31',
  session_hash:c.sessionHash,session_expires_at:'2026-12-05',device_thumbprint:proof.fingerprint};
 const db={query:async()=>({rows:[current]})};
 const accepted=await checkAccess({db,resource:RESOURCE.MEMBER_GACHA,token:c.token,deviceProof:proof,pepper,now});
 assert.equal(accepted.allowed,true);assert.equal(accepted.masterId,masterId);
 const wrong=await checkAccess({db,resource:RESOURCE.MEMBER_GACHA,token:c.token,
  deviceProof:{...proof,fingerprint:'sha256:'+'e'.repeat(64)},pepper,now});
 assert.equal(wrong.allowed,false);
 const expired=await checkAccess({db,resource:RESOURCE.MEMBER_GACHA,token:c.token,deviceProof:proof,pepper,now:new Date('2027-01-01')});
 assert.equal(expired.allowed,false);
});
