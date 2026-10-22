import test from 'node:test';
import assert from 'node:assert/strict';
import {registerV201,statusV201} from '../registration-name-v201.js';
const tokenHash='a'.repeat(64);
function input(id,name){return {browserId:'MIO-W-'+id.repeat(24).slice(0,24),tokenHash,name,loginId:''}}
function fakeDb({reservedNames=[]}={}){
 const normal=new Map(),reviews=new Map(),names=new Set(reservedNames),calls=[];
 const execute=async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  if(sql.includes('FROM mio_registration_v2 WHERE browser_id=$1'))return {rows:normal.has(args[0])?[normal.get(args[0])]:[]};
  if(sql.includes('SELECT browser_id,token_hash,name FROM mio_name_review_v201'))return {rows:reviews.has(args[0])?[reviews.get(args[0])]:[]};
  if(sql.includes('INSERT INTO mio_name_registry_v201')){
   if(names.has(args[0]))return {rows:[],rowCount:0};
   names.add(args[0]);return {rows:[{browser_id:args[2]}],rowCount:1};
  }
  if(sql.includes('INSERT INTO mio_name_review_v201')){reviews.set(args[0],{browser_id:args[0],token_hash:args[1],name:args[3]});return {rowCount:1,rows:[]}}
  if(sql.includes('INSERT INTO mio_registration_v2')){normal.set(args[0],{browser_id:args[0],token_hash:args[1],name:args[2],status:'承認待ち'});return {rowCount:1,rows:[]}}
  throw Error('unexpected query: '+sql);
 };
 return {normal,reviews,names,calls,connect:async()=>({query:execute,release(){}}),query:execute};
}
test('new name can register once and never inherits historical MIO ID',async()=>{
 const db=fakeDb();const a=input('b','初めてさん');
 const r=await registerV201(a,{db});
 assert.equal(r.created,true);assert.equal(r.pendingReview,false);
 assert.match(r.participantId,/^MIO-W-/);assert.equal(r.integratedParticipantId,undefined);
 const retry=await registerV201(a,{db});assert.equal(retry.created,false);assert.equal(retry.pendingReview,false);
 assert.equal(db.normal.size,1);
});
test('same name from another browser is held in review, not issued a valid registration',async()=>{
 const db=fakeDb();await registerV201(input('b','えむさん'),{db});
 const r=await registerV201(input('c','えむさん'),{db});
 assert.equal(r.pendingReview,true);assert.equal(r.status,'本人確認待ち');
 assert.equal(db.normal.size,1);assert.equal(db.reviews.size,1);
 const s=await statusV201(input('c','えむさん').browserId,tokenHash,{db});assert.equal(s.pendingReview,true);
});
test('existing legacy name blocks both new name and formatting variation',async()=>{
 const db=fakeDb({reservedNames:['えむじー🐱']});
 const r=await registerV201(input('d',' えむじー🐱 '),{db});
 assert.equal(r.pendingReview,true);assert.equal(db.normal.size,0);
});
test('same nickname review is idempotent and cannot be stolen with another token',async()=>{
 const db=fakeDb({reservedNames:['Maverick']});const a=input('e','Maverick');
 await registerV201(a,{db});const again=await registerV201(a,{db});assert.equal(again.pendingReview,true);assert.equal(db.reviews.size,1);
 await assert.rejects(registerV201({...a,tokenHash:'f'.repeat(64)},{db}),/identity mismatch/);
});
test('unrelated names and existing IDs remain untouched',async()=>{
 const db=fakeDb({reservedNames:['River']});
 const r=await registerV201(input('f','Different listener'),{db});
 assert.equal(r.created,true);assert.equal(db.normal.size,1);assert.equal(db.reviews.size,0);
});
test('pre-v2.0.1 browser with legacy-matching name is review pending, even if main row exists',async()=>{
 const db=fakeDb({reservedNames:['きーちゃん']});const a=input('9','きーちゃん');
 db.normal.set(a.browserId,{browser_id:a.browserId,token_hash:a.tokenHash,name:a.name,status:'承認待ち'});
 db.reviews.set(a.browserId,{browser_id:a.browserId,token_hash:a.tokenHash,name:a.name});
 const r=await registerV201(a,{db});assert.equal(r.pendingReview,true);
 const status=await statusV201(a.browserId,a.tokenHash,{db});assert.equal(status.pendingReview,true);assert.equal(status.status,'本人確認待ち');
});
