import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tokenBinding,verifyExistingIdentity,createRecoveryRequest,
 approveRecoveryRequest,redeemRecovery,requestEnabled,adminEnabled,claimEnabled} from '../mio-device-recovery-core.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const web='MIO-W-'+'a'.repeat(24),mio='MIO-0010';
const session={id:web,token:'b'.repeat(64)},key='x'.repeat(48);
const proof={ok:true,webId:web,mioId:mio,name:'テスト本人'};
const gas={ok:true,participantId:web,name:'テスト本人',status:'承認済み',
 progress:{attendanceConfirmedDays:[],attendanceLockedDays:[],gacha:{confirmed:true,total:3,remaining:3}}};
const neon={ok:true,participantId:web,name:'テスト本人',status:'承認済み',pendingReview:false,
 attendanceGrantVerified:true,integratedParticipantId:mio};

test('all release stages require separate exact flags',()=>{
 assert.equal(requestEnabled({}),false);
 assert.equal(adminEnabled({}),false);
 assert.equal(claimEnabled({}),false);
 const r={MIO_DEVICE_RECOVERY_RELEASE:'verified-device-recovery-20261031',
 MIO_DEVICE_RECOVERY_REQUEST_RELEASE:'verified-device-recovery-request-20261031'};
 assert.equal(requestEnabled(r),true);
 assert.equal(adminEnabled(r),false);
 assert.equal(claimEnabled(r),false);
});

test('binding is scoped to the exact signed light cookie, not to display name',()=>{
 assert.match(tokenBinding(session,key),/^[a-f0-9]{64}$/);
 assert.notEqual(tokenBinding(session,key),tokenBinding({...session,token:'c'.repeat(64)},key));
 assert.notEqual(tokenBinding(session,key),tokenBinding({...session,id:'MIO-W-'+'c'.repeat(24)},key));
 assert.throws(()=>tokenBinding({id:'nickname',token:session.token},key));
 assert.throws(()=>tokenBinding(session,'short'));
});

test('signed identity must independently match registration DB and GAS on same Web ID',async()=>{
 let calls=0;
 const getLight=async()=>{calls++;return neon};
 const callGAS=async()=>{calls++;return gas};
 const result=await verifyExistingIdentity(session,{getLight,callGAS});
 assert.equal(result.ok,true);
 assert.equal(result.mioId,mio);
 assert.equal(calls,2);
 for(const change of [
  {neon:{...neon,pendingReview:true}},
  {neon:{...neon,attendanceGrantVerified:false}},
  {neon:{...neon,integratedParticipantId:'invalid'}},
  {gas:{...gas,participantId:'MIO-W-'+'c'.repeat(24)}},
  {gas:{...gas,name:'別人'}},
  {gas:{...gas,progress:{...gas.progress,gacha:{...gas.progress.gacha,confirmed:false}}}}
 ]){
  const x=await verifyExistingIdentity(session,{getLight:async()=>change.neon||neon,
   callGAS:async()=>change.gas||gas});
  assert.equal(x.ok,false,JSON.stringify(change));
 }
});

function client(){
 const log=[], state={state:'pending',web_id:web,mio_id:mio,
  token_binding:tokenBinding(session,key),
  expires_at:new Date(Date.now()+600000),approved_operation_id:null,redeemed_at:null};
 const db={log,state,
 async query(sql,args=[]){
  log.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
  if(sql.includes('UPDATE mio_device_recovery_requests SET state=\'expired\''))return {rowCount:0,rows:[]};
  if(sql.includes('INSERT INTO mio_device_recovery_requests')){
   return {rowCount:1,rows:[{request_id:'11111111-1111-4111-8111-111111111111',state:'pending',expires_at:state.expires_at}]};
  }
  if(sql.includes('SELECT state,web_id,mio_id,approved_operation_id')){
   return {rowCount:1,rows:[{state:state.state,web_id:state.web_id,mio_id:state.mio_id,
    approved_operation_id:state.approved_operation_id}]};
  }
  if(sql.includes("SET state='approved'")){
   if(state.state!=='pending')return {rowCount:0,rows:[]};
   state.state='approved';state.approved_operation_id=args[3];
   return {rowCount:1,rows:[{request_id:args[0]}]};
  }
  if(sql.includes('SELECT state,web_id,mio_id,token_binding,expires_at,redeemed_at')){
   return {rowCount:1,rows:[{...state}]};
  }
  if(sql.includes("SET state='consumed'")){
   if(state.state!=='approved')return {rowCount:0,rows:[]};
   state.state='consumed';state.redeemed_at=new Date();
   return {rowCount:1,rows:[{request_id:args[0]}]};
  }
  throw Error('unexpected SQL');
 }};
 return db;
}
const id='11111111-1111-4111-8111-111111111111',op='f'.repeat(32);
test('request creation only accepts verified profile and preserves existing active request',async()=>{
 const db=client();
 const r=await createRecoveryRequest(db,proof,tokenBinding(session,key));
 assert.equal(r.state,'pending');
 assert.equal(db.log.filter(x=>x.sql.includes('INSERT INTO mio_device_recovery_requests')).length,1);
 assert.match(db.log.find(x=>x.sql.includes('INSERT INTO mio_device_recovery_requests')).sql,/ON CONFLICT \(web_id\)/);
 await assert.rejects(createRecoveryRequest(db,{...proof,ok:false},tokenBinding(session,key)));
});

test('one-click approval is idempotent with exact request, participant and operation ID',async()=>{
 const db=client();
 const payload={requestId:id,webId:web,mioId:mio,operationId:op};
 assert.deepEqual(await approveRecoveryRequest(db,payload,'admin-passkey'),{replayed:false,status:'approved'});
 assert.deepEqual(await approveRecoveryRequest(db,payload,'admin-passkey'),{replayed:true,status:'approved'});
 assert.equal(db.log.filter(x=>x.sql.includes("SET state='approved'")).length,1);
 await assert.rejects(approveRecoveryRequest(db,{...payload,operationId:'a'.repeat(32)},'admin-code'),/no longer pending/);
 await assert.rejects(approveRecoveryRequest(db,{...payload,webId:'MIO-W-'+'c'.repeat(24)},'admin-code'),/identity changed/);
});
test('claim can only use original cookie binding and permits short same-browser retry',async()=>{
 const db=client(),binding=tokenBinding(session,key),payload={requestId:id,webId:web,mioId:mio,binding};
 await approveRecoveryRequest(db,{requestId:id,webId:web,mioId:mio,operationId:op},'admin-code');
 await assert.rejects(redeemRecovery(db,{...payload,binding:'a'.repeat(64)}),/browser identity mismatch/);
 assert.deepEqual(await redeemRecovery(db,payload),{replayed:false});
 assert.deepEqual(await redeemRecovery(db,payload),{replayed:true});
 assert.equal(db.log.filter(x=>x.sql.includes("SET state='consumed'")).length,1);
 db.state.redeemed_at=new Date(Date.now()-240000);
 await assert.rejects(redeemRecovery(db,payload),/approval not valid/);
});
test('recovery endpoint does not register users, draw or award gacha rights',()=>{
 const clientAPI=read('api-mio-device-recovery-client.js');
 const adminAPI=read('api-mio-device-recovery-admin.js');
 const schema=read('db/mio-device-recovery-20261031.sql');
 const page=read('gacha.html'),gate=read('gacha-web-gate.html');
 const config=JSON.parse(read('vercel.json'));
 assert.match(clientAPI,/readLightSession\(req\.headers\.cookie/);
 assert.match(clientAPI,/verifyExistingIdentity/);
 assert.match(clientAPI,/sessionCookie\(session\.id,session\.token,cfg\.secret\)/);
 assert.match(clientAPI,/SIGNED_LIGHT_SESSION_REQUIRED/);
 assert.match(clientAPI,/requestEnabled\(\)/);
 assert.match(clientAPI,/claimEnabled\(\)/);
 assert.match(adminAPI,/authorizedCode\(body\.code/);
 assert.match(adminAPI,/sessionOK\(req\)/);
 assert.match(adminAPI,/adminEnabled\(\)/);
 assert.doesNotMatch(clientAPI+adminAPI,/bridge\(['"]register['"]|bridge\(['"]draw['"]|makeIdentity\(/);
 assert.match(schema,/CREATE UNIQUE INDEX IF NOT EXISTS mio_device_recovery_one_active/);
 assert.match(page,/id="deviceRecoveryPanel"/);
 assert.match(gate,/id="deviceRecoveryAdminPanel"/);
 assert.equal(config.routes.find(x=>x.src==='/api/mio-device-recovery-client')?.dest,'/api-mio-device-recovery-client.js');
 assert.equal(config.routes.find(x=>x.src==='/api/mio-device-recovery-admin')?.dest,'/api-mio-device-recovery-admin.js');
});
