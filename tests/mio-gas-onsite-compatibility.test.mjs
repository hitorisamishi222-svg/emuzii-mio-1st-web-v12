import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const load = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const full = load('GAS_Code_FULL_WEB_OPS_20261030.gs');
const moduleOnly = load('GAS_WebAdminOps_20261030.gs');
const oldGate = load('GAS_WebGateOnly_20261030.gs');
const defs = src => [...src.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(x => x[1]);

test('full GAS candidate has one doPost and one administrative dispatcher',()=>{
  const names=defs(full);
  assert.equal(names.filter(x=>x==='doPost').length,1);
  assert.equal(names.filter(x=>x==='mioAdminOps_').length,1);
  assert.equal(new Set(names).size,names.length,'GAS candidate cannot overwrite global functions by duplicate definitions');
});

test('standalone admin module is an exact copy, NEVER append to integrated candidate',()=>{
  const fullNames=new Set(defs(full));
  const partNames=defs(moduleOnly);
  const overlap=partNames.filter(x=>fullNames.has(x));
  assert.equal(partNames.length,20,'audit function inventory before GAS changes');
  assert.equal(overlap.length,20,'all 20 functions already included in integrated candidate');
  const first='function mioAdminOps_(ss,d){';
  assert.equal(full.slice(full.indexOf(first)).trimEnd(),
    moduleOnly.slice(moduleOnly.indexOf(first)).trimEnd(),
    'admin module must remain exactly matched to integrated candidate; never deploy both');
  assert.equal(defs(moduleOnly).includes('doPost'),false,'module must not replace existing doPost');
  assert.equal(defs(oldGate).includes('doPost'),false,'gate helper must not replace existing doPost');
});

test('admin dispatch runs only AFTER shared-secret verification and BEFORE participant identity check',()=>{
  const begin=full.indexOf('function doPost(e)');
  const secret=full.indexOf("if(!secret||!equal_(d.secret,secret))",begin);
  const gate=full.indexOf("if(d.action==='webGateRead'||d.action==='webGateSet')",begin);
  const admin=full.indexOf("if(/^webAdminOps(?:Read|Approve|Member|Grant|Review|Create|Intake)$/.test(d.action))",begin);
  const identity=full.indexOf("if(!/^MIO-W-[a-f0-9]{24}$/.test(d.participantId",begin);
  assert.ok(begin>=0&&secret>begin&&gate>secret&&admin>gate&&identity>admin,
    'an ops dispatcher in the wrong place would bypass authentication or reject all admin reads');
  assert.match(full.slice(begin,identity),/LockService\.getScriptLock\(\)/);
  assert.match(full.slice(begin,identity),/mioAdminOps_\(SpreadsheetApp\.openById\(SHEET_ID\),d\)/);
});

test('operator API never passes an unverified onsite request to the existing GAS',()=>{
  const api=load('api-gacha-admin-ops.js');
  assert.match(api,/authorizedCode\(d\.code/);
  assert.match(api,/sessionOK\(req\)/);
  assert.match(api,/MIO_GACHA_ONSITE_RELEASE/);
  assert.match(api,/d\.onSiteVerified!==true/);
  assert.match(api,/d\.action!=='read'&&!writeEnabled/);
  assert.match(api,/bridge\(operations\[d\.action\],data\)/);
});

test('completed grant operations cannot be replayed with a changed reason or old balance',()=>{
 const begin=moduleOnly.indexOf('function mioAdminOpsGrant_(ss,d){');
 const end=moduleOnly.indexOf('function mioAdminOpsReview_(ss,d){',begin);
 assert.ok(begin>=0&&end>begin);
 const code=moduleOnly.slice(begin,end)+'\n globalThis.__grant=mioAdminOpsGrant_;';
 const id='MIO-9000',op='f'.repeat(32),originalReason='現場で確認した特典';
 const g=Array(17).fill('');g[0]=id;g[1]='架空参加者';g[5]=3;g[7]=2;g[12]='OK';g[13]='OK';g[14]=2;
 let prior={c:[null,op,'付与','',id,2,3,'確定',originalReason,'架空参加者']};
 let writes=0;
 const context={
  mioAdminOpsRequest_:d=>d.operationId,
  mioAdminOpsStr_:x=>String(x??'').trim(),
  mioAdminOpsPeople_:()=>[[id,'架空参加者']],
  mioAdminOpsSheet_:()=>({getRange(){writes++;throw Error('no physical write expected')}}),
  mioAdminOpsValues_:()=>[g],
  mioAdminOpsOne_:(arr,idx,value)=>({row:2,c:arr.find(x=>x[idx]===value)}),
  mioAdminOpsName_:x=>String(x??''),
  mioAdminOpsLog_:()=>({}),
  mioAdminOpsExisting_:()=>prior,
 };
 vm.runInNewContext(code,context);
 const args={operationId:op,mioId:id,count:1,expectedSpecial:2,reason:originalReason};
 assert.throws(()=>context.__grant({}, {...args,reason:'違う理由'}),/操作IDの再利用は禁止/);
 assert.throws(()=>context.__grant({}, {...args,expectedSpecial:1,count:2}),/操作IDの再利用は禁止/);
 const same=context.__grant({},args);
 assert.equal(same.replayed,true);
 assert.equal(writes,0,'idempotent replay never writes another entitlement');
});
test('an existing gacha grant ledger row cannot be replayed under a different reason',()=>{
 const begin=moduleOnly.indexOf('function mioAdminOpsRecordGrant_(ss,op,id,name,count,reason,before,after){');
 const end=moduleOnly.indexOf('function mioAdminOpsGrant_(ss,d){',begin);
 assert.ok(begin>=0&&end>begin);
 const code=moduleOnly.slice(begin,end)+'\n globalThis.__record=mioAdminOpsRecordGrant_;';
 const op='d'.repeat(32),id='MIO-9001';
 const logRow=[null,id,'架空参加者',1,'最初の付与理由',3,4,4,4,op];
 let writes=0;
 const sheet={
  getRange(row,col,n,width){
   if(row===1&&col===10)return {getValue:()=> 'Web操作ID'};
   if(row===2&&col===10)return {getValues:()=>[[op]]};
   if(row===2&&col===1)return {getValues:()=>[logRow]};
   writes++;throw Error('unexpected history write');
  },
  getLastRow:()=>2
 };
 const context={
  mioAdminOpsSheet_:()=>sheet,
  mioAdminOpsStr_:x=>String(x??'').trim(),
 };
 vm.runInNewContext(code+'\n globalThis.__record=mioAdminOpsRecordGrant_;',context);
 assert.throws(()=>context.__record({},op,id,'架空参加者',1,'違う付与理由',3,4),
   /既存の付与履歴と操作内容が一致しません/);
 assert.equal(context.__record({},op,id,'架空参加者',1,'最初の付与理由',3,4),true);
 assert.equal(writes,0,'duplicate grant record never inserted');
});

test('duplicate legacy participant IDs cannot yield actionable gacha rows',()=>{
 const begin=moduleOnly.indexOf('function mioAdminOpsSummary_(ss,webRows){');
 const end=moduleOnly.indexOf('function mioAdminOpsRead_(ss,d){',begin);
 assert.ok(begin>=0&&end>begin);
 const code=moduleOnly.slice(begin,end)+'\n globalThis.__summary=mioAdminOpsSummary_;';
 const g=Array(17).fill('');g[0]='MIO-9001';g[1]='架空参加者';g[5]=2;g[7]=1;
 g[12]='OK';g[13]='OK';g[14]=0;
 const people=[['MIO-9001','架空参加者'],['MIO-9001','別名で重複']];
 const ss={'emuzii_ガチャ':[g],'emuzii_新規簡易登録':[]};
 const ctx={
  mioAdminOpsPeople_:()=>people,
  mioAdminOpsSheet_:(ss,key)=>ss[key],
  mioAdminOpsValues_:rows=>rows,
  mioAdminOpsStr_:x=>String(x??'').trim(),
  mioAdminOpsName_:x=>String(x??'').trim()
 };
 vm.runInNewContext(code,ctx);
 const duplicate=ctx.__summary(ss,[]);
 assert.equal(duplicate.roster.length,1);
 assert.equal(duplicate.roster[0].gacha,null,'same ID in multiple participant rows must be non-actionable');
 assert.equal(duplicate.roster[0].needsReview,true);
 people.pop();
 const normal=ctx.__summary(ss,[]);
 assert.equal(normal.roster[0].gacha.remaining,1,'a unique healthy row can be viewed');
 assert.equal(normal.roster[0].needsReview,false);
 g[7]=-1;
 const negative=ctx.__summary(ss,[]);
 assert.equal(negative.roster[0].gacha,null,'negative remaining rights fail closed');
 g[7]=3;
 const tooMany=ctx.__summary(ss,[]);
 assert.equal(tooMany.roster[0].needsReview,true,'remaining greater than total is inconsistent');
 g[7]=1;g[1]='別人のガチャ権利';
 const wrongPerson=ctx.__summary(ss,[]);
 assert.equal(wrongPerson.roster[0].needsReview,true,'name mismatch must never present a grant target');
 g[1]='架空参加者';g[5]='';
 const blankTotal=ctx.__summary(ss,[]);
 assert.equal(blankTotal.roster[0].gacha,null,'blank entitled amount must not silently become zero');
});
