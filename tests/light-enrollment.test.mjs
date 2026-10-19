import test from 'node:test';
import assert from 'node:assert/strict';
import {enroll,statusForBrowser,validateEnrollment,normalizeName,schemaSQL} from '../registration-light-store.js';
const id='MIO-W-'+'a'.repeat(24),tokenHash='b'.repeat(64);
function fakeDB(){
 const data=new Map(),calls=[];
 return {data,calls,async connect(){
  return {async query(sql,values=[]){
   calls.push({sql,values});
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
   if(sql.includes('INSERT INTO mio_registration_v2')){
    if(data.has(values[0]))return {rows:[]};
    const row={browser_id:values[0],token_hash:values[1],name:values[2],status:'承認待ち',integrated_participant_id:null};
    data.set(values[0],row);
    return {rows:[row]};
   }
   if(sql.includes('SELECT browser_id,name,status,integrated_participant_id,token_hash'))
    return {rows:data.has(values[0])?[data.get(values[0])]:[]};
   throw Error('Unexpected statement');
  },release(){}};
 },async query(sql,values){
  calls.push({sql,values});
  if(sql.includes('SELECT browser_id,name,status,integrated_participant_id,token_hash'))
   return {rows:data.has(values[0])?[data.get(values[0])]:[]};
  throw Error('Unexpected statement');
 }};
}
test('new registration persists as pending and does not assign a historical MIO-ID',async()=>{
 const db=fakeDB();const result=await enroll({browserId:id,tokenHash,name:'翠央',loginId:''},{db});
 assert.equal(result.status,'承認待ち');assert.equal(result.integratedParticipantId,'');
 assert.equal(result.created,true);assert.equal(db.data.size,1);
 assert.equal(db.calls.some(x=>/UPDATE|DELETE/.test(x.sql)),false);
});
test('same browser retry is idempotent',async()=>{
 const db=fakeDB();const payload={browserId:id,tokenHash,name:'翠央',loginId:''};
 await enroll(payload,{db});
 const result=await enroll(payload,{db});
 assert.equal(result.created,false);assert.equal(db.data.size,1);
});
test('identity collision cannot claim or overwrite an existing browser',async()=>{
 const db=fakeDB();await enroll({browserId:id,tokenHash,name:'翠央',loginId:''},{db});
 await assert.rejects(enroll({browserId:id,tokenHash:'c'.repeat(64),name:'翠央',loginId:''},{db}),/identity mismatch/);
 assert.equal(db.data.size,1);
 assert.equal(db.data.get(id).token_hash,tokenHash);
});
test('changing the registered name cannot silently overwrite a record',async()=>{
 const db=fakeDB();await enroll({browserId:id,tokenHash,name:'翠央',loginId:''},{db});
 await assert.rejects(enroll({browserId:id,tokenHash,name:'別の名前',loginId:''},{db}),/identity mismatch/);
});
test('status requires the same browser secret hash',async()=>{
 const db=fakeDB();await enroll({browserId:id,tokenHash,name:'翠央',loginId:''},{db});
 const result=await statusForBrowser(id,tokenHash,{db});
 assert.equal(result.status,'承認待ち');
 await assert.rejects(statusForBrowser(id,'c'.repeat(64),{db}),/unauthorized/);
});
test('validation blocks forged identities and unsafe inputs',()=>{
 assert.throws(()=>validateEnrollment({browserId:'MIO-0001',tokenHash,name:'A'}));
 assert.throws(()=>validateEnrollment({browserId:id,tokenHash:'x',name:'A'}));
 assert.throws(()=>validateEnrollment({browserId:id,tokenHash,name:'A\nB'}));
 assert.throws(()=>validateEnrollment({browserId:id,tokenHash,name:'A',loginId:'a'.repeat(33)}));
 assert.equal(normalizeName('Ａ　 B'),'AB');
 assert.match(schemaSQL,/approved_requires_verified_id/);
});
