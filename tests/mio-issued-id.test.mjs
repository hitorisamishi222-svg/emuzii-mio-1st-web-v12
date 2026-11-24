import test from 'node:test';
import assert from 'node:assert/strict';
import {issueOneTimeCode,invitationHash,newSession,sessionHash,requireMioId,
 requireRosterProof,requireOwner,requireDeviceProof,effectiveRank,mayEnterRoom} from '../mio-issued-id-core.mjs';
import {issueMioAccessId,claimMioAccessId,authorizeMioRoom} from '../mio-issued-id-store.mjs';
const pepper='this-is-a-test-only-pepper-and-is-not-a-production-secret-12345';
const thumb='sha256:'+'a'.repeat(64);
const proof={trusted:true,fresh:true,keyThumbprint:thumb};
const actor={role:'owner',userId:'mio-owner'};
const rosterProof={trusted:true,unique:true,masterId:'MIO-0017'};
const getDb=(onQuery)=>({calls:[],async query(sql,args){this.calls.push({sql,args});return onQuery(sql,args)}});

test('issued ID has 128-bit entropy and a non-reversible peppered lookup',()=>{
 const a=issueOneTimeCode(pepper),b=issueOneTimeCode(pepper);
 assert.match(a.code,/^MIO-ONCE-[a-f0-9]{32}$/);assert.notEqual(a.code,b.code);
 assert.equal(invitationHash(a.code,pepper),a.codeHash);
 assert.doesNotMatch(a.codeHash,/MIO-ONCE/);
 assert.throws(()=>invitationHash('MIO-0017',pepper),/INVALID_INVITATION/);
});
test('existing short and new format master IDs are valid; fake IDs fail',()=>{
 assert.equal(requireMioId('MIO-0017'),'MIO-0017');
 assert.equal(requireMioId('MIO-AB12-CD34'),'MIO-AB12-CD34');
 assert.throws(()=>requireMioId('MIO-W-1'),/INVALID_MIO_ID/);
});
test('issuer owner and real source proof required (never trust name or input)',()=>{
 assert.equal(requireOwner(actor,{active:true,owner_user_id:'mio-owner'}),true);
 assert.throws(()=>requireOwner({role:'admin',userId:'mio-owner'},{active:true,owner_user_id:'mio-owner'}),/ISSUER_OWNER_REQUIRED/);
 assert.equal(requireRosterProof(rosterProof,'MIO-0017'),true);
 assert.throws(()=>requireRosterProof({trusted:false,unique:true,masterId:'MIO-0017'},'MIO-0017'),/ROSTER_PROOF_REQUIRED/);
 assert.throws(()=>requireRosterProof({trusted:true,unique:true,masterId:'MIO-0018'},'MIO-0017'),/ROSTER_PROOF_REQUIRED/);
});
test('secret possession alone cannot impersonate device without verified fresh proof',()=>{
 assert.equal(requireDeviceProof(proof,thumb),true);
 assert.throws(()=>requireDeviceProof({keyThumbprint:thumb},thumb),/DEVICE_PROOF_REQUIRED/);
 assert.throws(()=>requireDeviceProof({...proof,fresh:false},thumb),/DEVICE_PROOF_REQUIRED/);
});
test('three rooms: public no ID; fan; unexpired membership only',()=>{
 assert.equal(mayEnterRoom('public',null),true);
 assert.equal(mayEnterRoom('fan',null),false);
 assert.equal(mayEnterRoom('member','fan'),false);
 assert.equal(mayEnterRoom('fan','member'),true);
 assert.equal(mayEnterRoom('member','member'),true);
 assert.equal(mayEnterRoom('unknown','member'),false);
 assert.equal(effectiveRank({status:'active',rank:'member',member_until:'2026-12-31'},new Date('2026-11-24')),'member');
 assert.equal(effectiveRank({status:'active',rank:'member',member_until:'2026-10-01'},new Date('2026-11-24')),'fan');
 assert.equal(effectiveRank({status:'revoked',rank:'member',member_until:'2027-01-01'}),null);
});
test('reissuance increments generation, clears legacy device session and revokes earlier invitations',async()=>{
 const db=getDb((sql)=>{
  if(sql.includes('FROM mio_access_issuers_v1'))return {rows:[{active:true,owner_user_id:'mio-owner'}]};
  if(sql.includes('FROM mio_access_audit_v1'))return {rows:[]};
  if(sql.includes('SELECT generation'))return {rows:[{generation:8}]};
  return {rows:[],rowCount:1};
 });
 const r=await issueMioAccessId({db,actor,issuerId:'mio',masterId:'MIO-0017',rank:'fan',rosterProof,pepper,
  operationId:'12345678-1234-4123-8123-123456789012'});
 assert.equal(r.generation,8);assert.match(r.code,/^MIO-ONCE-/);
 const joined=db.calls.map(x=>x.sql).join('\n');
 assert.match(joined,/generation=mio_access_accounts_v1.generation\+1/);
 assert.match(joined,/session_hash=NULL/);assert.match(joined,/status='revoked'/);
 assert.equal(db.calls[0].sql,'BEGIN');assert.equal(db.calls.at(-1).sql,'COMMIT');
});
test('bad roster proof aborts issuance without touching DB',async()=>{
 const db=getDb(()=>{throw Error('DB_CALLED')});
 await assert.rejects(issueMioAccessId({db,actor,issuerId:'mio',masterId:'MIO-0017',rank:'fan',
  rosterProof:{trusted:false,unique:true,masterId:'MIO-0017'},pepper}),/ROSTER_PROOF_REQUIRED/);
 assert.equal(db.calls.length,0);
});
test('reused operation cannot issue another ID',async()=>{
 const db=getDb((sql)=>{
  if(sql.includes('FROM mio_access_issuers_v1'))return {rows:[{active:true,owner_user_id:'mio-owner'}]};
  if(sql.includes('FROM mio_access_audit_v1'))return {rows:[{operation_id:'already'}]};
  return {rows:[]};
 });
 await assert.rejects(issueMioAccessId({db,actor,issuerId:'mio',masterId:'MIO-0017',rank:'fan',rosterProof,pepper,operationId:'12345678-1234-4123-8123-123456789012'}),/DUPLICATE_OPERATION/);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');
});
test('claim one-time ID binds exactly one device and expires the ID',async()=>{
 const one=issueOneTimeCode(pepper);
 const db=getDb((sql,args)=>{
  if(sql.includes('FROM mio_access_invites_v1 i')){
   assert.equal(args[1],one.codeHash);
   return {rows:[{invite_id:'inv',master_id:'MIO-0017',generation:3,current_generation:3,account_status:'active',expires_at:'2026-12-01'}]};
  }
  return {rows:[],rowCount:1};
 });
 const r=await claimMioAccessId({db,issuerId:'mio',code:one.code,deviceProof:proof,pepper,now:new Date('2026-11-24')});
 assert.equal(r.masterId,'MIO-0017');assert.match(r.sessionToken,/^[a-f0-9]{64}$/);
 assert.ok(db.calls.some(c=>c.sql.includes("status='claimed'")));
 assert.ok(db.calls.some(c=>c.sql.includes('device_thumbprint=$2,session_hash=$3')));
 assert.equal(db.calls.at(-1).sql,'COMMIT');
});
test('used ID and stale generation fail closed without session',async()=>{
 const one=issueOneTimeCode(pepper);
 for(const row of [null,{invite_id:'inv',master_id:'MIO-0017',generation:2,current_generation:3,account_status:'active',expires_at:'2026-12-01'}]){
  const db=getDb((sql)=>sql.includes('FROM mio_access_invites_v1 i')?{rows:row?[row]:[]}:{rows:[]});
  await assert.rejects(claimMioAccessId({db,issuerId:'mio',code:one.code,deviceProof:proof,pepper,now:new Date('2026-11-24')}),/INVALID_OR_USED_ID/);
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 }
});
test('no proof or wrong issuer syntax rejects before DB access',async()=>{
 const db=getDb(()=>{throw Error('DB_CALLED')});
 await assert.rejects(claimMioAccessId({db,issuerId:'mio',code:issueOneTimeCode(pepper).code,deviceProof:{keyThumbprint:thumb},pepper}),/DEVICE_PROOF_REQUIRED/);
 assert.equal(db.calls.length,0);
});
test('every room check consults current DB session, membership expiration, verified device',async()=>{
 const s=newSession(pepper);
 assert.equal(sessionHash(s.token,pepper),s.sessionHash);
 const db=getDb(()=>({rows:[{master_id:'MIO-0017',status:'active',rank:'member',member_until:'2026-11-20',
  session_hash:s.sessionHash,session_expires_at:'2026-12-24',device_thumbprint:thumb}]}));
 const member=await authorizeMioRoom({db,room:'member',sessionToken:s.token,deviceProof:proof,pepper,now:new Date('2026-11-24')});
 assert.equal(member.allowed,false);assert.equal(member.rank,'fan');
 const fan=await authorizeMioRoom({db,room:'fan',sessionToken:s.token,deviceProof:proof,pepper,now:new Date('2026-11-24')});
 assert.equal(fan.allowed,true);
 const bad=await authorizeMioRoom({db,room:'fan',sessionToken:s.token,deviceProof:{...proof,fresh:false},pepper,now:new Date('2026-11-24')});
 assert.equal(bad.allowed,false);
 const pub=await authorizeMioRoom({db,room:'public',sessionToken:'',deviceProof:null,pepper});assert.equal(pub.allowed,true);
});
test('old session after reissue is rejected even with matching device',async()=>{
 const s=newSession(pepper);const db=getDb(()=>({rows:[]}));
 const x=await authorizeMioRoom({db,room:'fan',sessionToken:s.token,deviceProof:proof,pepper});
 assert.equal(x.allowed,false);assert.equal(x.reason,'SESSION_EXPIRED_OR_REVOKED');
});
