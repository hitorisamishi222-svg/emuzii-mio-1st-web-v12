import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const old=read('GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs');
const candidate=read('GAS_Code_OCTOBER_WITH_ADMIN_OPS_GRANT_GUARD_CANDIDATE_20261110.gs');
const start='function mioAdminOpsGrant_(ss,d){',end='\nfunction mioAdminOpsReview_(';
const section=(code)=>code.slice(code.indexOf(start),code.indexOf(end,code.indexOf(start)));
const oldGrant=section(old),newGrant=section(candidate);

function simulate(webRows){
 const calls=[],person=['MIO-9001','架空参加者'];
 const g=Array(17).fill('');g[0]=person[0];g[1]=person[1];g[5]=3;g[7]=2;
 g[12]='OK';g[13]='OK';g[14]=1;
 const ctx={
  Number,String,Array,Date,
  mioAdminOpsRequest_:d=>d.operationId,
  mioAdminOpsStr_:x=>String(x==null?'':x).trim(),
  mioAdminOpsName_:x=>String(x==null?'':x).trim().normalize('NFKC').replace(/[\s\u3000]/g,'').toLowerCase(),
  mioAdminOpsPeople_:()=>[person],
  mioAdminOpsSheet_:(ss,key)=>{calls.push('read:'+key);return key;},
  mioAdminOpsValues_:(key)=>key==='emuzii_ガチャ'?[g]:key==='emuzii_Web登録'?webRows:[],
  mioAdminOpsOne_:(items,col,value)=>{
   const match=items.filter(r=>String(r[col])===value);
   if(match.length!==1)throw Error('conflict');
   return {row:2,c:match[0]};
  },
  mioAdminOpsLog_:()=>{calls.push('AUDIT_WRITE_GATE');throw Error('STOP_AT_AUDIT_GATE');},
  mioAdminOpsExisting_:()=>{throw Error('MUST_NOT_REACH_EXISTING_AUDIT');}
 };
 vm.runInNewContext(newGrant+'\n globalThis.__grant=mioAdminOpsGrant_;',ctx);
 const request={mioId:person[0],count:1,expectedSpecial:1,reason:'架空テスト付与',operationId:'a'.repeat(32)};
 return {calls,run:()=>ctx.__grant({},request)};
}
function browser(name,id='MIO-9001',wid='MIO-W-'+'a'.repeat(24),status='承認済み'){
 const r=Array(21).fill('');r[0]=wid;r[2]=name;r[5]=status;r[7]=id;return r;
}

test('unpublished guarded candidate preserves every legacy byte and changes Grant only',()=>{
 assert.ok(old.includes(start));
 assert.equal(candidate.slice(0,candidate.indexOf(start)),old.slice(0,old.indexOf(start)));
 assert.equal(candidate.slice(candidate.indexOf(end,candidate.indexOf(start))),
              old.slice(old.indexOf(end,old.indexOf(start))));
 assert.match(newGrant,/linkedWeb=mioAdminOpsValues_/);
 assert.doesNotMatch(oldGrant,/linkedWeb=mioAdminOpsValues_/);
 assert.equal((candidate.match(/function doPost\s*\(/g)||[]).length,1);
 const funcs=[...candidate.matchAll(/^[ \t]*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]);
 assert.equal(funcs.length,62);
 assert.equal(new Set(funcs).size,62);
});
test('a previously approved browser-name mismatch fails before any audit or grant write',()=>{
 const t=simulate([browser('旧表示名')]);
 assert.throws(t.run,/承認済みWeb登録の表示名が参加者台帳と異なります/);
 assert.equal(t.calls.includes('AUDIT_WRITE_GATE'),false);
 assert.ok(t.calls.includes('read:emuzii_Web登録'));
});
test('a second mismatched browser for the same existing MIO-ID blocks the grant',()=>{
 const t=simulate([browser('架空参加者'),browser('別名','MIO-9001','MIO-W-'+'b'.repeat(24))]);
 assert.throws(t.run,/承認済みWeb登録の表示名が参加者台帳と異なります/);
 assert.equal(t.calls.includes('AUDIT_WRITE_GATE'),false);
});
test('duplicate approved Web IDs also fail before the audit gate',()=>{
 const b=browser('架空参加者');
 const t=simulate([b,[...b]]);
 assert.throws(t.run,/承認済みブラウザIDの重複・不整合/);
 assert.equal(t.calls.includes('AUDIT_WRITE_GATE'),false);
});
test('NFKC-equivalent approved browser names pass identity check, then reach unchanged audit gate',()=>{
 const t=simulate([browser('架 空 参 加 者')]);
 assert.throws(t.run,/STOP_AT_AUDIT_GATE/);
 assert.equal(t.calls.filter(x=>x==='AUDIT_WRITE_GATE').length,1);
});
test('person without an approved Web browser is not automatically denied by this name check',()=>{
 const t=simulate([browser('別人','MIO-9002'),browser('旧表示名','MIO-9001',undefined,'却下')]);
 assert.throws(t.run,/STOP_AT_AUDIT_GATE/);
 assert.equal(t.calls.filter(x=>x==='AUDIT_WRITE_GATE').length,1);
});
test('mismatched approved Web names never modify registration or identity sheets',()=>{
 const t=simulate([browser('旧表示名')]);
 assert.throws(t.run,/承認済みWeb登録の表示名/);
 assert.ok(t.calls.every(x=>x.startsWith('read:')));
});
