import test from 'node:test';
import assert from 'node:assert/strict';
import {issuerRegisterAccess,claimIssuedAccess,activatePendingAccess} from '../mio-level-registration-vnext.mjs';
import {codeDigest} from '../mio-level-access-vnext.mjs';

const pepper='isolated-per-participant-proof-pepper-with-more-than-48-characters';
const actor={source:'server-session',role:'owner',userId:'mio-owner'};
const users=[['MIO-0017','ユーリ'],['MIO-0018','別の参加者']];
const now=new Date('2026-11-25T00:00:00.000Z');
function fakeDb(){
 const usersDb=new Map(),invites=new Map(),pending=new Map(),queries=[];
 const query=async(sql,args=[])=>{
  queries.push({sql,args});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
  if(sql.includes('FROM mio_level_issuers_v1'))return {rows:[{owner_user_id:'mio-owner',active:true}]};
  if(sql.includes('FROM mio_level_accounts_v1 WHERE master_id'))
   return {rows:usersDb.has(args[0])?[usersDb.get(args[0])]:[]};
  if(sql.includes('FROM mio_level_audit_v1'))return {rows:[]};
  if(sql.startsWith('INSERT INTO mio_level_audit_v1'))return {rows:[]};
  if(sql.startsWith('INSERT INTO mio_level_accounts_v1')){
   usersDb.set(args[0],{master_id:args[0],display_name:args[1],status:'pending',generation:0});
   return {rows:[]};
  }
  if(sql.startsWith("UPDATE mio_level_invites_v1 SET status='revoked'")){
   // Simulate exactly the WHERE master_id=$1 AND status='issued' clause.
   assert.match(sql,/WHERE master_id=\$1 AND status='issued'/);
   const retired=[...invites.values()].filter(x=>x.master_id===args[0]&&x.status==='issued');
   for(const row of retired)row.status='revoked';
   return {rows:retired.map(x=>({invite_id:x.invite_id}))};
  }
  if(sql.startsWith('INSERT INTO mio_level_invites_v1')){
   invites.set(args[4],{invite_id:args[0],master_id:args[1],issuer_id:args[2],generation:args[3],
    code_hash:args[4],status:'issued',expires_at:args[5],level:args[6],member_until:args[7]});
   return {rows:[]};
  }
  if(sql.startsWith('SELECT master_id FROM mio_level_invites_v1')){
   const row=invites.get(args[0]);return {rows:row?.status==='issued'?[{master_id:row.master_id}]:[]};
  }
  if(sql.startsWith('SELECT invite_id,master_id,issuer_id,generation,expires_at,level,member_until,status FROM mio_level_invites_v1')){
   const row=invites.get(args[0]);return {rows:row?.status==='issued'?[row]:[]};
  }
  if(sql.startsWith('SELECT invite_id,master_id,generation,device_thumbprint,session_hash,session_expires_at,status,expires_at FROM mio_level_pending_claims_v1')){
   const row=pending.get(args[0]);return {rows:row?[row]:[]};
  }
  if(sql.startsWith('SELECT invite_id,master_id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,status,expires_at FROM mio_level_pending_claims_v1')){
   const row=pending.get(args[0]);return {rows:row?[row]:[]};
  }
  if(sql.startsWith('INSERT INTO mio_level_pending_claims_v1')){
   const [invite_id,master_id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,expires_at]=args;
   pending.set(invite_id,{invite_id,master_id,generation,device_thumbprint,device_public_jwk,session_hash,session_expires_at,browser_hint,os_hint,status:'pending',expires_at});return {rows:[]};
  }
  if(sql.startsWith("UPDATE mio_level_invites_v1 SET status='claimed'")){
   const row=[...invites.values()].find(x=>x.invite_id===args[0]&&x.status==='issued');
   if(!row)return {rows:[]};row.status='claimed';return {rows:[{invite_id:row.invite_id}]};
  }
  if(sql.startsWith("UPDATE mio_level_accounts_v1 SET status='active'")){
   const row=usersDb.get(args[0]);
   row.status='active';row.generation=args[1];row.session_hash=args[4];row.level=args[8];
   row.session_expires_at=args[5];return {rows:[{master_id:args[0]}]};
  }
  if(sql.startsWith("UPDATE mio_level_pending_claims_v1 SET status='active'")){
   const row=pending.get(args[0]);if(!row||row.status!=='pending')return {rows:[]};
   row.status='active';return {rows:[{invite_id:args[0]}]};
  }
  throw Error('Unexpected test SQL: '+sql.slice(0,150));
 };
 return {usersDb,invites,queries,query,async connect(){return {query,release(){}}}};
}
const issue=(db,id,name,operationId)=>issuerRegisterAccess({db,actor,issuerId:'mio',
 masterId:id,displayName:name,level:2,pepper,now,operationId,
 rosterProof:{source:'gas-verified',unique:true,masterId:id,displayName:name}});
const proof={source:'server-verified-signature',fresh:true,
 fingerprint:'sha256:'+'a'.repeat(64)};

test('A issue then B issue leaves A invitation active; A reissue revokes only A',async()=>{
 const db=fakeDb();
 const a1=await issue(db,...users[0],'12345678-1234-4123-8123-123456789011');
 const b1=await issue(db,...users[1],'12345678-1234-4123-8123-123456789012');
 assert.equal(a1.replacedCount,0);
 assert.equal(b1.replacedCount,0);
 assert.equal(db.invites.get(codeDigest(a1.code,pepper)).status,'issued');
 assert.equal(db.invites.get(codeDigest(b1.code,pepper)).status,'issued');
 const a2=await issue(db,...users[0],'12345678-1234-4123-8123-123456789013');
 assert.equal(a2.replacedCount,1);
 assert.equal(db.invites.get(codeDigest(a1.code,pepper)).status,'revoked');
 assert.equal(db.invites.get(codeDigest(a2.code,pepper)).status,'issued');
 assert.equal(db.invites.get(codeDigest(b1.code,pepper)).status,'issued');
 assert.equal(db.invites.get(codeDigest(b1.code,pepper)).master_id,'MIO-0018');
 const b2=await issue(db,...users[1],'12345678-1234-4123-8123-123456789014');
 assert.equal(b2.replacedCount,1);
 assert.equal(db.invites.get(codeDigest(a2.code,pepper)).status,'issued');
 assert.equal(db.invites.get(codeDigest(b1.code,pepper)).status,'revoked');
 assert.equal(db.invites.get(codeDigest(b2.code,pepper)).status,'issued');
 assert.deepEqual([...db.invites.values()].filter(x=>x.status==='issued').map(x=>x.master_id).sort(),users.map(x=>x[0]).sort());
});
test('B can redeem after A code reissue; A can redeem latest independently',async()=>{
 const db=fakeDb();
 await issue(db,...users[0],'12345678-1234-4123-8123-123456789015');
 const b1=await issue(db,...users[1],'12345678-1234-4123-8123-123456789016');
 const a2=await issue(db,...users[0],'12345678-1234-4123-8123-123456789017');
 const rB=await claimIssuedAccess({db,displayName:users[1][1],code:b1.code,
  deviceProof:proof,pepper,now});
 assert.equal(rB.masterId,'MIO-0018');
 assert.equal(db.invites.get(codeDigest(a2.code,pepper)).status,'issued');
 const rA=await claimIssuedAccess({db,displayName:users[0][1],code:a2.code,
  deviceProof:proof,pepper,now});
 assert.equal(rA.masterId,'MIO-0017');
 assert.equal(db.usersDb.get('MIO-0018').status,'pending');
 assert.equal(db.usersDb.get('MIO-0017').status,'pending');
 assert.equal(db.invites.get(codeDigest(b1.code,pepper)).status,'issued');
 assert.equal(db.invites.get(codeDigest(a2.code,pepper)).status,'issued');
});

test('ten recipients can be issued consecutively and activated in a different order',async()=>{
 const db=fakeDb();
 const people=Array.from({length:10},(_,i)=>[
  `MIO-${String(9990+i)}`,`Synthetic QA ${String(i+1).padStart(2,'0')}`
 ]);
 const receipts=[];
 for(let i=0;i<people.length;i++){
  const operationId=`12345678-1234-4123-8123-${String(123456789100+i)}`;
  receipts.push(await issue(db,...people[i],operationId));
 }
 const live=[...db.invites.values()].filter(row=>row.status==='issued');
 assert.equal(live.length,10);
 assert.equal(new Set(live.map(row=>row.master_id)).size,10);
 const order=[8,2,9,1,7,0,5,3,6,4];
 for(const index of order){
  const person=people[index],receipt=receipts[index];
  const pending=await claimIssuedAccess({db,displayName:person[1],code:receipt.code,
   deviceProof:proof,pepper,now});
  assert.equal(pending.state,'pending');
  assert.equal(pending.masterId,person[0]);
  const activated=await activatePendingAccess({db,displayName:person[1],code:receipt.code,
   sessionToken:pending.sessionToken,deviceProof:proof,pepper,now});
  assert.equal(activated.masterId,person[0]);
  assert.equal(db.usersDb.get(person[0]).status,'active');
  assert.equal(db.invites.get(codeDigest(receipt.code,pepper)).status,'claimed');
 }
 assert.equal([...db.usersDb.values()].filter(row=>row.status==='active').length,10);
 assert.equal([...db.invites.values()].filter(row=>row.status==='claimed').length,10);
});
