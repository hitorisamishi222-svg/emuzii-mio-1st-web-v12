import test from 'node:test';
import assert from 'node:assert/strict';
import {issueYuriCode} from '../api-yuri-issue.js';
import {redeemYuriCode} from '../api-yuri-restore.js';
import {credentialsFromCode,TARGET} from '../mio-yuri-recovery-core.mjs';

const gasHash='9ac305f78857e9c3a2fbf81cc442e6d7c794621d74390dec14d4dcb51a400467';
const status={ok:true,participantId:TARGET.webId,name:TARGET.name,status:'承認済み',
  progress:{attendanceAchieved:false,gacha:{confirmed:true,total:2,used:0,remaining:2}}};
const GAS=async(action,args)=>{
 assert.equal(action,'status');assert.deepEqual(args,{participantId:TARGET.webId,tokenHash:gasHash});
 return status;
};
const CODE=n=>'MIO-REC-'+n.toString(16).padStart(32,'0');

function fakeDatabase(){
 const state={rows:[],logs:[],failNextInsert:false,rollbackCount:0};
 const clone=()=>structuredClone(state.rows);
 const operation=async(sql,args=[])=>{
  state.logs.push({sql,args});
  if(sql.startsWith('SELECT n.token_hash AS gas_hash FROM mio_registration_v2'))return {rows:[{gas_hash:gasHash}]};
  if(sql.startsWith('SELECT n.browser_id'))return {rows:[{browser_id:TARGET.webId}]};
  if(sql.startsWith('SELECT recovery_hash FROM mio_yuri_recovery_v1')){
   const r=state.rows.find(r=>r.hash===args[0]&&!r.redeemed&&!r.revoked);
   return {rows:r?[{recovery_hash:r.hash}]:[]};
  }
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[{}]};
  if(sql.includes('SET redeemed_at=now(),revoked_at=now()')){
   const old=state.rows.filter(r=>!r.redeemed&&!r.revoked);
   for(const r of old){r.redeemed=true;r.revoked=true;r.sessionLive=false}
   return {rows:old.map(r=>({recovery_hash:r.hash}))};
  }
  if(sql.startsWith('INSERT INTO mio_yuri_recovery_v1')){
   if(state.failNextInsert){state.failNextInsert=false;throw Error('SIMULATED_DB_INSERT_FAILURE')}
   if(state.rows.some(r=>!r.redeemed&&!r.revoked))throw Error('UNIQUE_ACTIVE_CODE');
   state.rows.push({hash:args[0],tokenHash:args[3],redeemed:false,revoked:false,sessionLive:false});
   return {rows:[{expires_at:'2026-11-27T00:00:00Z'}]};
  }
  if(sql.startsWith('UPDATE mio_yuri_recovery_v1')&&sql.includes('SET redeemed_at=now(),session_expires_at=')){
   const r=state.rows.find(r=>r.hash===args[0]&&!r.redeemed&&!r.revoked);
   if(!r)return {rows:[]};
   r.redeemed=true;r.sessionLive=true;return {rows:[{recovery_hash:r.hash}]};
  }
  if(sql.startsWith('UPDATE mio_yuri_recovery_v1')&&sql.includes('SET session_expires_at=now(),revoked_at=')){
   const old=state.rows.filter(r=>r.hash!==args[2]&&r.redeemed&&r.sessionLive);
   for(const r of old){r.sessionLive=false;r.revoked=true}
   return {rows:[]};
  }
  return {rows:[]};
 };
 return {state,query:operation,async connect(){
   let snapshot=null;
   return {async query(sql,args=[]){
    if(sql==='BEGIN'){snapshot=clone();state.logs.push({sql,args});return {rows:[]}}
    if(sql==='COMMIT'){snapshot=null;state.logs.push({sql,args});return {rows:[]}}
    if(sql==='ROLLBACK'){state.rows=snapshot||state.rows;state.rollbackCount++;state.logs.push({sql,args});return {rows:[]}}
    return operation(sql,args);
   },release(){state.logs.push({sql:'RELEASE',args:[]})}};
 }};
}

test('unlimited consecutive issue keeps just the latest unused recovery ID',async()=>{
 const db=fakeDatabase();
 for(let i=1;i<=4;i++){
  const result=await issueYuriCode({database:db,callGAS:GAS,newCode:CODE(i)});
  assert.equal(result.drawsRemaining,2);
  assert.equal(result.replacedCount,i===1?0:1);
  assert.equal(db.state.rows.filter(r=>!r.redeemed&&!r.revoked).length,1);
  assert.equal(db.state.rows.find(r=>!r.redeemed).hash,credentialsFromCode(CODE(i)).codeHash);
 }
 assert.equal(db.state.rows.length,4);
 assert.equal(db.state.rows.filter(r=>r.revoked).length,3);
 const calls=db.state.logs.map(x=>x.sql);
 assert.equal(calls.filter(s=>s==='BEGIN').length,4);
 assert.equal(calls.filter(s=>s==='COMMIT').length,4);
 assert.equal(calls.filter(s=>s==='SELECT pg_advisory_xact_lock(hashtext($1))').length,4);
 assert.equal(calls.filter(s=>s.includes('RETURNING expires_at')).length,4);
});

test('old ID is rejected, only last one redeems, gacha still exactly two',async()=>{
 const db=fakeDatabase();
 await issueYuriCode({database:db,callGAS:GAS,newCode:CODE(1)});
 await issueYuriCode({database:db,callGAS:GAS,newCode:CODE(2)});
 await assert.rejects(redeemYuriCode({db,code:CODE(1),callGAS:GAS}),/CODE_EXPIRED_OR_USED/);
 const result=await redeemYuriCode({db,code:CODE(2),callGAS:GAS});
 assert.equal(result.entitlement.remaining,2);
 assert.equal(db.state.rows.filter(r=>r.sessionLive).length,1);
});

test('new ID issue failure atomically restores formerly valid code',async()=>{
 const db=fakeDatabase();
 await issueYuriCode({database:db,callGAS:GAS,newCode:CODE(1)});
 db.state.failNextInsert=true;
 await assert.rejects(issueYuriCode({database:db,callGAS:GAS,newCode:CODE(2)}),/SIMULATED_DB_INSERT_FAILURE/);
 assert.equal(db.state.rows.length,1);
 assert.equal(db.state.rows[0].revoked,false);
 assert.equal(db.state.rows[0].redeemed,false);
 assert.equal(db.state.rollbackCount,1);
 const result=await redeemYuriCode({db,code:CODE(1),callGAS:GAS});
 assert.equal(result.entitlement.total,2);
});

test('prior successful device session survives issuance until new ID actually logs in',async()=>{
 const db=fakeDatabase();
 await issueYuriCode({database:db,callGAS:GAS,newCode:CODE(1)});
 await redeemYuriCode({db,code:CODE(1),callGAS:GAS});
 assert.equal(db.state.rows.filter(r=>r.sessionLive).length,1);
 await issueYuriCode({database:db,callGAS:GAS,newCode:CODE(2)});
 assert.equal(db.state.rows.filter(r=>r.sessionLive).length,1);
 await redeemYuriCode({db,code:CODE(2),callGAS:GAS});
 assert.equal(db.state.rows.filter(r=>r.sessionLive).length,1);
 assert.equal(db.state.rows[0].revoked,true);
 assert.equal(db.state.rows[0].sessionLive,false);
 assert.equal(db.state.rows[1].sessionLive,true);
});

test('redemption uses same per-browser advisory lock and atomic revocation predicates',async()=>{
 const db=fakeDatabase();
 await issueYuriCode({database:db,callGAS:GAS,newCode:CODE(11)});
 await redeemYuriCode({db,code:CODE(11),callGAS:GAS});
 const sql=db.state.logs.map(x=>x.sql).join('\n');
 assert.match(sql,/revoked_at IS NULL AND expires_at>now\(\)/);
 assert.match(sql,/SET session_expires_at=now\(\),revoked_at=COALESCE/);
 assert.equal(db.state.rows.filter(x=>x.sessionLive).length,1);
});
