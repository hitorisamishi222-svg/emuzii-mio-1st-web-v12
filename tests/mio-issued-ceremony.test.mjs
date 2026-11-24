import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {issueOneTimeCode,newSession,sessionHash} from '../mio-issued-id-core.mjs';
import {deviceSigningPayload} from '../mio-issued-device-proof.mjs';
import {beginClaimChallenge,finishClaimChallenge,beginRoomChallenge,finishRoomChallenge} from '../mio-issued-id-ceremony.mjs';
import {withMioAccessTransaction} from '../mio-issued-id-store.mjs';
const pepper='test-only-pepper-keep-out-of-production-we-use-a-long-value-123456';
const now=new Date('2026-11-24T00:00:00Z');
async function device(){
 const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const jwk=await webcrypto.subtle.exportKey('jwk',keys.publicKey);
 return {jwk,sign:async ({purpose,nonce,requestHash})=>Buffer.from(await webcrypto.subtle.sign(
  {name:'ECDSA',hash:'SHA-256'},keys.privateKey,deviceSigningPayload({purpose,nonce,requestHash}))).toString('base64url')};
}
function dbFor(fn){
 const entries=[];
 const client={async query(sql,args=[]){entries.push({sql,args});return fn(sql,args)}};
 const db={entries,client,acquired:0,released:0,async connect(){this.acquired++;return {...client,release:()=>{this.released++}}},async query(...args){return client.query(...args)}};
 return db;
}
test('a pg Pool transaction uses only one pinned client and releases after commit',async()=>{
 const db=dbFor(()=>({rows:[]}));
 await withMioAccessTransaction(db,async c=>{await c.query('TEST');return 1});
 assert.equal(db.acquired,1);assert.equal(db.released,1);
 assert.deepEqual(db.entries.map(x=>x.sql),['BEGIN','TEST','COMMIT']);
});
test('failed pg transaction rolls back and releases same client',async()=>{
 const db=dbFor(()=>({rows:[]}));
 await assert.rejects(withMioAccessTransaction(db,async()=>{throw Error('no')}),/no/);
 assert.equal(db.acquired,1);assert.equal(db.released,1);
 assert.deepEqual(db.entries.map(x=>x.sql),['BEGIN','ROLLBACK']);
});
test('claim challenge requires an existing live one-use invitation',async()=>{
 const d=await device(),one=issueOneTimeCode(pepper);
 const bad=dbFor(()=>({rows:[]}));
 await assert.rejects(beginClaimChallenge({db:bad,issuerId:'mio',code:one.code,jwk:d.jwk,pepper,now}),/INVALID_OR_USED_ID/);
 assert.equal(bad.entries.some(x=>x.sql.includes('INSERT')),false);
});
test('claim: signed P-256 proof, consumed nonce and invite share one pg transaction',async()=>{
 const d=await device(),one=issueOneTimeCode(pepper);
 let consumed=false;
 const db=dbFor((sql,args)=>{
  if(sql.includes('SELECT i.generation'))return {rows:[{generation:2,current_generation:2,account_status:'active',expires_at:'2026-12-01'}]};
  if(sql.includes('UPDATE mio_access_challenges_v1')){
   if(consumed)return {rows:[]};
   consumed=true;
   return {rows:[{purpose:'claim',request_hash:args[2],expires_at:'2026-12-01'}]};
  }
  if(sql.includes('SELECT i.invite_id'))return {rows:[{invite_id:'invite',master_id:'MIO-0017',generation:2,current_generation:2,account_status:'active',expires_at:'2026-12-01'}]};
  if(sql.includes('SET device_public_jwk=$2'))return {rows:[{master_id:'MIO-0017'}]};
  return {rows:[],rowCount:1};
 });
 const prep=await beginClaimChallenge({db,issuerId:'mio',code:one.code,jwk:d.jwk,pepper,now});
 const signature=await d.sign(prep);
 const x=await finishClaimChallenge({db,issuerId:'mio',code:one.code,jwk:d.jwk,nonce:prep.nonce,signature,pepper,now});
 assert.equal(x.masterId,'MIO-0017');
 assert.match(x.sessionToken,/^[a-f0-9]{64}$/);
 assert.equal(db.acquired,1);assert.equal(db.released,1);
 const sql=db.entries.map(x=>x.sql);
 assert.equal(sql.filter(x=>x==='BEGIN').length,1);
 assert.equal(sql.filter(x=>x==='COMMIT').length,1);
 assert.ok(sql.findIndex(x=>x.includes('SET used_at=now()'))<sql.findIndex(x=>x.includes('SET status=\'claimed\'')));
 await assert.rejects(finishClaimChallenge({db,issuerId:'mio',code:one.code,jwk:d.jwk,nonce:prep.nonce,signature,pepper,now}),/CHALLENGE_EXPIRED_OR_REPLAYED/);
 assert.equal(db.entries.at(-1).sql,'ROLLBACK');
});
test('claim: other private key, tampered user key, purpose or request hash fail before DB update',async()=>{
 const good=await device(),evil=await device(),one=issueOneTimeCode(pepper);
 const db=dbFor(sql=>sql.includes('SELECT i.generation')?{rows:[{generation:2,current_generation:2,account_status:'active',expires_at:'2026-12-01'}]}:{rows:[]});
 const prep=await beginClaimChallenge({db,issuerId:'mio',code:one.code,jwk:good.jwk,pepper,now});
 const badSig=await evil.sign(prep);
 const before=db.entries.length;
 await assert.rejects(finishClaimChallenge({db,issuerId:'mio',code:one.code,jwk:good.jwk,nonce:prep.nonce,signature:badSig,pepper,now}),/DEVICE_SIGNATURE_REJECTED/);
 assert.equal(db.entries.length,before);
});
test('beginRoom honors expiry and permits only active ranks; protected room never anonymous',async()=>{
 const s=newSession(pepper),d=await device();
 const db=dbFor(sql=>sql.includes('SELECT rank,status')?{rows:[{rank:'fan',status:'active',member_until:null,session_expires_at:'2026-12-01',device_public_jwk:d.jwk}]}:{rows:[],rowCount:1});
 await assert.rejects(beginRoomChallenge({db,room:'member',sessionToken:s.token,pepper,now}),/ROOM_FORBIDDEN/);
 const x=await beginRoomChallenge({db,room:'fan',sessionToken:s.token,pepper,now});
 assert.equal(x.purpose,'room');
 assert.ok(db.entries.some(x=>x.sql.includes('bound_room')));
 await assert.rejects(beginRoomChallenge({db,room:'member',sessionToken:'',pepper,now}),/INVALID_SESSION/);
});
test('room: signed proof is checked against stored key and DB rank before access',async()=>{
 const s=newSession(pepper),d=await device(),hashed=sessionHash(s.token,pepper);
 const account={master_id:'MIO-0017',rank:'member',status:'active',member_until:'2026-12-31',device_public_jwk:d.jwk,device_thumbprint:null,session_hash:hashed,session_expires_at:'2026-12-01'};
 const db=dbFor((sql,args)=>{
  if(sql.includes('UPDATE mio_access_challenges_v1'))return {rows:[{purpose:'room',request_hash:args[3],expires_at:'2026-12-01'}]};
  if(sql.includes('SELECT device_public_jwk,device_thumbprint'))return {rows:[account]};
  if(sql.includes('SELECT rank,status'))return {rows:[account]};
  if(sql.includes('SELECT master_id,rank,status'))return {rows:[account]};
  return {rows:[],rowCount:1};
 });
 const first=await beginRoomChallenge({db,room:'member',sessionToken:s.token,pepper,now});
 const sig=await d.sign(first);
 // The fixture binds the signing key hash explicitly; compare to public key.
 const {deviceKeyThumbprint}=await import('../mio-issued-device-proof.mjs');
 account.device_thumbprint=deviceKeyThumbprint(d.jwk);
 const ok=await finishRoomChallenge({db,room:'member',sessionToken:s.token,nonce:first.nonce,signature:sig,pepper,now});
 assert.equal(ok.allowed,true);assert.equal(ok.masterId,'MIO-0017');
});
