import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../GAS_WebAdminOps_20261030.gs',import.meta.url),'utf8');
function sandbox({schemaReady=true}={}){
 const rows={
  'emuzii_Web登録':[['Web参加ID'],['MIO-W-1234567890abcdef12345678','token','新しい人','',new Date(),'承認待ち','未確認','MIO-0001','','','','確認待ち',...Array(9).fill('')]],
  'emuzii_参加者':[['参加者ID'],['MIO-0001','新しい人']],
  'emuzii_ガチャ':[['参加者ID'],['MIO-0001','新しい人',0,0,0,2,0,2,0,0,0,'','OK','OK',2,0,'解放']],
  'emuzii_ガチャ付与履歴':[['日時']],
  'emuzii_当選履歴':[['抽選ID']],
  'emuzii_新規簡易登録':[['登録日時'],['','初訪問者','MIO-W-222222222222222222222222','登録','未確認','']]
 };
 if(schemaReady){
  rows['emuzii_Web管理操作履歴']=[[
   '日時','操作ID','操作種別','Web参加ID','MIO-ID',
   '変更前','変更後','処理状態','備考','対象名'
  ]];
  rows['emuzii_ガチャ付与履歴'][0][9]='Web操作ID';
 }
 const write=[];
 const ss={
  getSheetByName(n){return rows[n]?sheet(n):null},
  insertSheet(n){rows[n]=[];return sheet(n)}
 };
 function sheet(name){
  return {
   getLastRow(){return rows[name].length},
   getMaxRows(){return 1000},
   getRange(row,col,rs=1,cs=1){
    return {
     getValues(){return Array.from({length:rs},(_,ri)=>Array.from({length:cs},(_,ci)=>{
      // Model the existing participant A-column formula consistently for
      // single-cell reads and rectangular readbacks.
      if(name==='emuzii_参加者'&&row+ri===3&&col+ci===1&&rows[name][2]?.[1])return 'MIO-0002';
      return rows[name][row+ri-1]?.[col+ci-1]??'';
     }))},
     getValue(){if(name==='emuzii_参加者'&&col===1&&row===3&&rows[name][2]?.[1])return 'MIO-0002';return rows[name][row-1]?.[col-1]??''},
     getFormula(){return name==='emuzii_参加者'&&col===1&&row===3?'=IF(B3="","","MIO-"&TEXT(ROW()-1,"0000"))':''},
     setValue(v){if(!rows[name][row-1])rows[name][row-1]=[];rows[name][row-1][col-1]=v;write.push({name,row,col,v});return this},
     setValues(matrix){for(let ri=0;ri<matrix.length;ri++)for(let ci=0;ci<matrix[ri].length;ci++){if(!rows[name][row+ri-1])rows[name][row+ri-1]=[];rows[name][row+ri-1][col+ci-1]=matrix[ri][ci];write.push({name,row:row+ri,col:col+ci+0,v:matrix[ri][ci]})}return this}
    };
   },
   setFrozenRows(){}
  };
 }
 const context={SpreadsheetApp:{flush(){}},console,Date,safeText_(x){return String(x)},ensureWebDerivedRow_(){},webIntegrityOk_(r){return r[5]==='承認済み'&&r[7]===r[10]&&r[11]==='確認済み'},safeText_(v){return v}};
 vm.runInNewContext(source,context);
 return {rows,write,ss,exec:d=>context.mioAdminOps_(ss,d)};
}
test('module syntax and fail-closed operation dispatch',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 const x=sandbox();
 assert.throws(()=>x.exec({action:'bad'}),/未対応/);
 assert.equal(x.write.length,0);
});
test('safe read hides tokens and returns pending, roster and simple intake',()=>{
 const x=sandbox(),out=x.exec({action:'webAdminOpsRead'});
 assert.equal(out.ok,true);
 assert.equal(out.pending.length,1);
 assert.equal(out.roster[0].mioId,'MIO-0001');
 assert.equal(out.simple[0].name,'初訪問者');
 assert.equal(JSON.stringify(out).includes('token'),false);
});
test('read-only operator snapshot never writes, creates audit tabs, or adds the missing operation ID column',()=>{
 const x=sandbox({schemaReady:false});
 const before=JSON.stringify(x.rows);
 assert.equal(Object.hasOwn(x.rows,'emuzii_Web管理操作履歴'),false);
 assert.equal(x.rows['emuzii_ガチャ付与履歴'][0][9],undefined);
 for(let i=0;i<2;i++){
  const view=x.exec({action:'webAdminOpsRead'});
  assert.equal(view.ok,true);
  assert.equal(view.totalPending,1);
  assert.equal(x.write.length,0,'read-only API must never write cells or headers');
  assert.equal(JSON.stringify(x.rows),before,'read must not change the stored ledger or schema');
  assert.equal(Object.hasOwn(x.rows,'emuzii_Web管理操作履歴'),false);
  assert.equal(x.rows['emuzii_ガチャ付与履歴'][0][9],undefined);
 }
});
test('read-only operator snapshot fails closed on absent required ledger without creating it',()=>{
 const x=sandbox({schemaReady:false});
 const before=JSON.stringify(x.rows);
 delete x.rows['emuzii_ガチャ付与履歴'];
 const afterDelete=JSON.stringify(x.rows);
 assert.notEqual(afterDelete,before);
 assert.throws(()=>x.exec({action:'webAdminOpsRead'}),/必要な管理シートがありません/);
 assert.equal(JSON.stringify(x.rows),afterDelete);
 assert.equal(x.write.length,0);
 assert.equal(Object.hasOwn(x.rows,'emuzii_Web管理操作履歴'),false);
});
test('current production schema fails closed for every admin write without creating tables or cells',()=>{
 const cases=[
  {label:'grant',action:{action:'webAdminOpsGrant',operationId:'1'.repeat(32),
   mioId:'MIO-0001',count:1,expectedSpecial:2,reason:'模擬追加付与'}},
  {label:'approve',action:{action:'webAdminOpsApprove',operationId:'2'.repeat(32),
   webId:'MIO-W-1234567890abcdef12345678',mioId:'MIO-0001',
   memberConfirmed:false,expectedStatus:'承認待ち'}},
  {label:'review',action:{action:'webAdminOpsReview',operationId:'3'.repeat(32),
   row:2,expectedStatus:'未確認'}},
  {label:'intake',action:{action:'webAdminOpsIntake',operationId:'4'.repeat(32),
   name:'架空の新規申請',note:'本人確認待ち'}},
  {label:'create',action:{action:'webAdminOpsCreate',operationId:'5'.repeat(32),
   webId:'MIO-W-aaaaaaaaaaaaaaaaaaaaaaaa',expectedStatus:'承認待ち'}}
 ];
 for(const item of cases){
  const x=sandbox({schemaReady:false});
  if(item.label==='create'){
   x.rows['emuzii_参加者'].push(Array(10).fill(''));
   x.rows['emuzii_Web登録'].push([item.action.webId,'test-token','初訪問者','',new Date(),
    '承認待ち','未確認','','','','','確認待ち',...Array(9).fill('')]);
  }
  const before=JSON.stringify(x.rows);
  assert.throws(()=>x.exec(item.action),/未整備/,'missing schema must block '+item.label);
  assert.equal(JSON.stringify(x.rows),before,'no tab, column, credits or identity may change: '+item.label);
  assert.equal(x.write.length,0,'never write to a production-like schema: '+item.label);
  assert.equal(Object.hasOwn(x.rows,'emuzii_Web管理操作履歴'),false);
  assert.equal(x.rows['emuzii_ガチャ付与履歴'][0][9],undefined);
 }
});
test('grant refuses a missing or renamed operation-id header before any credit is changed',()=>{
 for(const header of ['',null,'旧Web操作ID','操作ID']){
  const x=sandbox();
  x.rows['emuzii_ガチャ付与履歴'][0][9]=header;
  const before=JSON.stringify(x.rows);
  assert.throws(()=>x.exec({action:'webAdminOpsGrant',operationId:'6'.repeat(32),
   mioId:'MIO-0001',count:2,expectedSpecial:2,reason:'ガチャ付与検査'}),
   /Web操作ID列が未整備/);
  assert.equal(JSON.stringify(x.rows),before);
  assert.equal(x.write.length,0);
  assert.equal(x.rows['emuzii_ガチャ'][1][14],2);
 }
});
test('corrupted audit headers prevent every mutation without rewriting existing headers',()=>{
 for(const action of [
  {action:'webAdminOpsGrant',operationId:'7'.repeat(32),
   mioId:'MIO-0001',count:2,expectedSpecial:2,reason:'付与動作確認'},
  {action:'webAdminOpsApprove',operationId:'8'.repeat(32),
   webId:'MIO-W-1234567890abcdef12345678',mioId:'MIO-0001',
   memberConfirmed:false,expectedStatus:'承認待ち'},
  {action:'webAdminOpsIntake',operationId:'9'.repeat(32),
   name:'架空の受付',note:'申請'}
 ]){
  const x=sandbox();
  x.rows['emuzii_Web管理操作履歴'][0][1]='旧形式操作ID';
  const before=JSON.stringify(x.rows);
  assert.throws(()=>x.exec(action),/列見出しが不一致/);
  assert.equal(JSON.stringify(x.rows),before);
  assert.equal(x.write.length,0);
 }
});
test('GAS candidate code never auto-creates admin audit tabs or operation-ID column',()=>{
 const full=readFileSync(new URL('../GAS_Code_FULL_WEB_OPS_20261030.gs',import.meta.url),'utf8');
 for(const c of [source,full]){
  assert.doesNotMatch(c,/insertSheet\('emuzii_Web管理操作履歴'\)/);
  assert.doesNotMatch(c,/setValue\('Web操作ID'\)/);
  assert.match(c,/Web管理操作履歴タブが未整備/);
  assert.match(c,/ガチャ付与履歴のWeb操作ID列が未整備/);
 }
});
test('confirmed grant replay is read-only and requires the original grant history row',()=>{
 const request={action:'webAdminOpsGrant',operationId:'4'.repeat(32),
  mioId:'MIO-0001',count:2,expectedSpecial:2,reason:'初回の模擬付与'};
 for(const scenario of ['missing','changedReason','changedRecipient','duplicate']){
  const x=sandbox();x.exec(request);
  const history=x.rows['emuzii_ガチャ付与履歴'];
  if(scenario==='missing')history.pop();
  if(scenario==='changedReason')history[1][4]='別の理由';
  if(scenario==='changedRecipient')history[1][1]='MIO-9999';
  if(scenario==='duplicate')history.push([...history[1]]);
  const before=JSON.stringify(x.rows),writes=x.write.length;
  assert.throws(()=>x.exec(request),
   scenario==='missing'?/確定済み付与の履歴が存在しません/:
    scenario==='duplicate'?/付与履歴の操作IDが重複しています/:
     /既存の付与履歴と操作内容が一致しません/,
   'confirmed audit is not enough to claim a successful replay: '+scenario);
  assert.equal(JSON.stringify(x.rows),before,'never repair an already confirmed ledger: '+scenario);
  assert.equal(x.write.length,writes,'verified-only operation cannot write: '+scenario);
  assert.equal(x.rows['emuzii_ガチャ'][1][14],4);
 }
 const x=sandbox();x.exec(request);
 const before=JSON.stringify(x.rows),writes=x.write.length;
 assert.equal(x.exec(request).replayed,true);
 assert.equal(JSON.stringify(x.rows),before);
 assert.equal(x.write.length,writes);
});
test('confirmed approval replay requires unchanged live identity and performs no writes',()=>{
 const request={action:'webAdminOpsApprove',operationId:'a'.repeat(32),
  webId:'MIO-W-1234567890abcdef12345678',mioId:'MIO-0001',
  memberConfirmed:true,expectedStatus:'承認待ち'};
 for(const state of ['approvalRemoved','identityCorrupt','memberReverted','otherDevice','renamedPerson','renamedWeb']){
  const x=sandbox();x.exec(request);
  if(state==='approvalRemoved')x.rows['emuzii_Web登録'][1][5]='承認待ち';
  if(state==='identityCorrupt')x.rows['emuzii_Web登録'][1][11]='未確認';
  if(state==='memberReverted')x.rows['emuzii_Web登録'][1][6]='未確認';
  if(state==='otherDevice')x.rows['emuzii_Web登録'][1][16]='旧端末';
  if(state==='renamedPerson')x.rows['emuzii_参加者'][1][1]='別の人';
  if(state==='renamedWeb')x.rows['emuzii_Web登録'][1][2]='別の人';
  const before=JSON.stringify(x.rows),writes=x.write.length;
  assert.throws(()=>x.exec(request),/前の処理を管理者が確認中です/,state);
  assert.equal(JSON.stringify(x.rows),before);
  assert.equal(x.write.length,writes);
 }
 const x=sandbox();x.exec(request);
 const before=JSON.stringify(x.rows),writes=x.write.length;
 assert.equal(x.exec(request).replayed,true);
 assert.equal(JSON.stringify(x.rows),before);
 assert.equal(x.write.length,writes);
});
test('confirmed new MIO-ID replay verifies original participant still exists with the same name',()=>{
 const webId='MIO-W-aaaaaaaaaaaaaaaaaaaaaaaa';
 const request={action:'webAdminOpsCreate',operationId:'b'.repeat(32),
  webId,expectedStatus:'承認待ち'};
 for(const mode of ['renamedParticipant','missingParticipant','renamedWeb']){
  const x=sandbox();
  x.rows['emuzii_参加者'].push(Array(10).fill(''));
  x.rows['emuzii_Web登録'].push([webId,'token2','初訪問者','',new Date(),
   '承認待ち','未確認','','','','','確認待ち',...Array(9).fill('')]);
  assert.equal(x.exec(request).mioId,'MIO-0002');
  if(mode==='renamedParticipant')x.rows['emuzii_参加者'][2][1]='別の人';
  if(mode==='missingParticipant')x.rows['emuzii_参加者'][2][1]='';
  if(mode==='renamedWeb')x.rows['emuzii_Web登録'][2][2]='別の人';
  const before=JSON.stringify(x.rows),writes=x.write.length;
  assert.throws(()=>x.exec(request),
   mode==='renamedWeb'?/操作IDの再利用は禁止です/:
     /確定済み参加者IDの本人整合を確認できません/,mode);
  assert.equal(JSON.stringify(x.rows),before);
  assert.equal(x.write.length,writes);
 }
 const x=sandbox();
 x.rows['emuzii_参加者'].push(Array(10).fill(''));
 x.rows['emuzii_Web登録'].push([webId,'token2','初訪問者','',new Date(),
  '承認待ち','未確認','','','','','確認待ち',...Array(9).fill('')]);
 x.exec(request);
 const before=JSON.stringify(x.rows),writes=x.write.length;
 assert.equal(x.exec(request).replayed,true);
 assert.equal(JSON.stringify(x.rows),before);
 assert.equal(x.write.length,writes);
});
test('grant updates only special count and writes idempotent audit',()=>{
 const x=sandbox(),op='e'.repeat(32),grant={action:'webAdminOpsGrant',operationId:op,mioId:'MIO-0001',count:2,expectedSpecial:2,reason:'イベント特別付与'};
 const first=x.exec(grant);
 assert.equal(first.special,4);
 assert.equal(x.rows['emuzii_ガチャ'][1][14],4);
 assert.equal(x.exec(grant).replayed,true);
 assert.equal(x.rows['emuzii_Web管理操作履歴'].length,2);
 assert.equal(x.rows['emuzii_ガチャ付与履歴'].length,2);
 assert.equal(x.rows['emuzii_ガチャ付与履歴'][1][1],'MIO-0001');
 assert.equal(x.rows['emuzii_ガチャ付与履歴'][1][3],2);
 assert.equal(x.rows['emuzii_ガチャ付与履歴'][1][9],op);
 assert.throws(()=>x.exec({...grant,operationId:'f'.repeat(32),expectedSpecial:2}),/変更されています/);
 assert.equal(x.rows['emuzii_ガチャ'][1][14],4);
 assert.equal(x.write.some(x=>x.name==='emuzii_当選履歴'),false);
});
test('confirmed grant rejects same operation ID with changed count or expected balance, even when sum is identical',()=>{
 const x=sandbox(),operationId='a'.repeat(32);
 const grant={action:'webAdminOpsGrant',operationId,mioId:'MIO-0001',
  count:2,expectedSpecial:2,reason:'イベント特別付与'};
 x.exec(grant);
 const before=JSON.stringify(x.rows),writes=x.write.length;
 assert.throws(()=>x.exec({...grant,count:1,expectedSpecial:3}),/操作IDの再利用は禁止/);
 assert.equal(JSON.stringify(x.rows),before);
 assert.equal(x.write.length,writes,'changed intent must not touch either ledger');
 assert.equal(x.exec(grant).replayed,true,'unchanged operation must still be idempotent');
});
test('confirmed grant rejects reuse of same operation ID with another reason',()=>{
 const x=sandbox(),operationId='b'.repeat(32);
 const grant={action:'webAdminOpsGrant',operationId,mioId:'MIO-0001',
  count:2,expectedSpecial:2,reason:'イベント特別付与'};
 x.exec(grant);
 const writes=x.write.length;
 assert.throws(()=>x.exec({...grant,reason:'別の理由による追加付与'}),/操作IDの再利用は禁止/);
 assert.equal(x.write.length,writes);
 assert.equal(x.rows['emuzii_ガチャ'][1][14],4);
});
test('interrupted grant never resumes a changed payload or a modified audit identity',()=>{
 const x=sandbox(),operationId='d'.repeat(32);
 const grant={action:'webAdminOpsGrant',operationId,mioId:'MIO-0001',
  count:2,expectedSpecial:2,reason:'イベント特別付与'};
 x.exec(grant);
 x.rows['emuzii_Web管理操作履歴'][1][7]='処理中';
 const before=JSON.stringify(x.rows),writes=x.write.length;
 assert.throws(()=>x.exec({...grant,count:1,expectedSpecial:3}),/操作IDの再利用は禁止/);
 assert.equal(JSON.stringify(x.rows),before);
 assert.equal(x.write.length,writes);
 // Audit identity was externally tampered with; never certify its replay.
 x.rows['emuzii_Web管理操作履歴'][1][9]='別人の記録';
 assert.throws(()=>x.exec(grant),/操作IDの再利用は禁止/);
 assert.equal(x.write.length,writes);
});
test('interrupted grant rejects tampered history reason without completing audit',()=>{
 const x=sandbox(),op='f'.repeat(32);
 const request={action:'webAdminOpsGrant',operationId:op,mioId:'MIO-0001',
  count:2,expectedSpecial:2,reason:'イベント特別付与'};
 x.exec(request);
 x.rows['emuzii_Web管理操作履歴'][1][7]='処理中';
 x.rows['emuzii_ガチャ付与履歴'][1][4]='異なる付与理由';
 const before=JSON.stringify(x.rows),writes=x.write.length;
 assert.throws(()=>x.exec(request),/既存の付与履歴と操作内容が一致しません/);
 assert.equal(JSON.stringify(x.rows),before);
 assert.equal(x.write.length,writes);
});
test('interrupted grant rejects tampered grantee name in history without extra credits',()=>{
 const x=sandbox(),op='0'.repeat(32);
 const request={action:'webAdminOpsGrant',operationId:op,mioId:'MIO-0001',
  count:2,expectedSpecial:2,reason:'イベント特別付与'};
 x.exec(request);
 x.rows['emuzii_Web管理操作履歴'][1][7]='処理中';
 x.rows['emuzii_ガチャ付与履歴'][1][2]='別人';
 const before=JSON.stringify(x.rows),writes=x.write.length;
 assert.throws(()=>x.exec(request),/既存の付与履歴と操作内容が一致しません/);
 assert.equal(JSON.stringify(x.rows),before);
 assert.equal(x.write.length,writes);
 assert.equal(x.rows['emuzii_ガチャ'][1][14],4);
});
test('both archived GAS candidate variants enforce identical grant replay identity checks',()=>{
 const full=readFileSync(new URL('../GAS_Code_FULL_WEB_OPS_20261030.gs',import.meta.url),'utf8');
 for(const code of [source,full]){
  assert.match(code,/Number\(prev\.c\[5\]\)!==expected/);
  assert.match(code,/mioAdminOpsStr_\(prev\.c\[8\]\)!==reason/);
  assert.ok(code.includes('mioAdminOpsStr_(h[4])!==reason'));
  assert.ok(code.includes('mioAdminOpsName_(h[2])!==mioAdminOpsName_(name)'));
  assert.match(code,/mioAdminOpsName_\(prev\.c\[9\]\)!==mioAdminOpsName_\(name\)/);
 }
 assert.doesNotThrow(()=>new vm.Script(full));
});
test('all 19 archived Web admin helpers stay byte-identical across standalone and integrated GAS candidates',()=>{
 const full=readFileSync(new URL('../GAS_Code_FULL_WEB_OPS_20261030.gs',import.meta.url),'utf8');
 const helperNames=[
  'mioAdminOps_','mioAdminOpsStr_','mioAdminOpsName_','mioAdminOpsSheet_',
  'mioAdminOpsValues_','mioAdminOpsOne_','mioAdminOpsPeople_',
  'mioAdminOpsSummary_','mioAdminOpsRead_','mioAdminOpsRequest_',
  'mioAdminOpsLog_','mioAdminOpsExisting_','mioAdminOpsWriteLog_',
  'mioAdminOpsCreate_','mioAdminOpsApprove_','mioAdminOpsRecordGrant_',
  'mioAdminOpsGrant_','mioAdminOpsReview_','mioAdminOpsIntake_'
 ];
 const extract=(code,name)=>{
  const start=code.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'Missing '+name);
  const end=code.indexOf(String.fromCharCode(10)+'function ',start+1);
  return code.slice(start,end<0?code.length:end).trim();
 };
 assert.equal(helperNames.length,19);
 for(const name of helperNames){
  assert.equal(extract(source,name),extract(full,name),'Candidate source drift: '+name);
 }
});
test('grant recovery refuses a non-pending, non-final audit state without touching credits',()=>{
 for(const corrupted of ['要調査','失敗','']){
  const x=sandbox(),d={action:'webAdminOpsGrant',operationId:'1'.repeat(32),
   mioId:'MIO-0001',count:2,expectedSpecial:2,reason:'イベント特別付与'};
  x.exec(d);
  x.rows['emuzii_Web管理操作履歴'][1][7]=corrupted;
  const before=JSON.stringify(x.rows),writes=x.write.length;
  assert.throws(()=>x.exec(d),/付与操作の監査状態を手動確認してください/);
  assert.equal(JSON.stringify(x.rows),before,'unknown state must never mutate ledger');
  assert.equal(x.write.length,writes,'unknown state must never write new credits');
 }
});
test('approval recovery refuses a corrupted audit state without re-approving a device',()=>{
 for(const corrupted of ['要調査','失敗','']){
  const x=sandbox(),d={action:'webAdminOpsApprove',operationId:'2'.repeat(32),
   webId:'MIO-W-1234567890abcdef12345678',mioId:'MIO-0001',
   memberConfirmed:true,expectedStatus:'承認待ち'};
  x.exec(d);
  x.rows['emuzii_Web管理操作履歴'][1][7]=corrupted;
  const before=JSON.stringify(x.rows),writes=x.write.length;
  assert.throws(()=>x.exec(d),/承認操作の監査状態を手動確認してください/);
  assert.equal(JSON.stringify(x.rows),before,'unknown approval status must remain unchanged');
  assert.equal(x.write.length,writes);
 }
});
test('new member-ID recovery refuses a corrupted audit state and never claims success',()=>{
 for(const corrupted of ['要調査','失敗','']){
  const x=sandbox(),webId='MIO-W-aaaaaaaaaaaaaaaaaaaaaaaa';
  x.rows['emuzii_参加者'].push(Array(10).fill(''));
  x.rows['emuzii_Web登録'].push([webId,'token2','初訪問者','',new Date(),
   '承認待ち','未確認','','','','','確認待ち',...Array(9).fill('')]);
  const d={action:'webAdminOpsCreate',operationId:'3'.repeat(32),webId,
   expectedStatus:'承認待ち'};
  const created=x.exec(d);
  assert.equal(created.mioId,'MIO-0002');
  x.rows['emuzii_Web管理操作履歴'][1][7]=corrupted;
  const before=JSON.stringify(x.rows),writes=x.write.length;
  assert.throws(()=>x.exec(d),/新規ID操作の監査状態を手動確認してください/);
  assert.equal(JSON.stringify(x.rows),before);
  assert.equal(x.write.length,writes);
 }
});
test('approval requires exact name and linked MIO ID, preserves token',()=>{
 const x=sandbox(),key='a'.repeat(32),d={action:'webAdminOpsApprove',operationId:key,webId:'MIO-W-1234567890abcdef12345678',mioId:'MIO-0001',memberConfirmed:true,expectedStatus:'承認待ち'};
 assert.equal(x.exec(d).status,'承認済み');
 assert.equal(x.rows['emuzii_Web登録'][1][5],'承認済み');
 assert.equal(x.rows['emuzii_Web登録'][1][6],'確認済み');
 assert.equal(x.rows['emuzii_Web登録'][1][1],'token');
 assert.equal(x.exec(d).replayed,true);
 const other=sandbox();
 other.rows['emuzii_参加者'][1][1]='別人';
 assert.throws(()=>other.exec(d),/参加者名が一致しません/);
 assert.equal(other.rows['emuzii_Web登録'][1][5],'承認待ち');
});
test('simple intake review is not registration approval',()=>{
 const x=sandbox();
 x.exec({action:'webAdminOpsReview',operationId:'b'.repeat(32),row:2,expectedStatus:'未確認'});
 assert.equal(x.rows['emuzii_新規簡易登録'][1][4],'確認済み');
 assert.equal(x.rows['emuzii_Web登録'][1][5],'承認待ち');
});
test('preview assets add independent API, keep current draw route',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.routes.find(r=>r.src==='/api/gacha')?.dest,'/api-gacha.js');
 assert.equal(config.routes.find(r=>r.src==='/api/gacha-web-gate')?.dest,'/api-gacha-web-gate.js');
 assert.equal(config.routes.find(r=>r.src==='/api/gacha-admin-ops')?.dest,'/api-gacha-admin-ops.js');
 const api=readFileSync(new URL('../api-gacha-admin-ops.js',import.meta.url),'utf8');
 assert.match(api,/MIO_GACHA_ADMIN_OPS_RELEASE/);
 const html=readFileSync(new URL('../gacha-web-gate.html',import.meta.url),'utf8');
 for(const id of ['opsPending','opsRoster','opsGrant','opsSimple','normal','fest'])assert.ok(html.includes('id="'+id+'"'));
});

test('new visitor MIO-ID is created only after exact unlinked registration check',()=>{
 const x=sandbox(),webId='MIO-W-aaaaaaaaaaaaaaaaaaaaaaaa';
 x.rows['emuzii_参加者'].push(Array(10).fill(''));
 x.rows['emuzii_Web登録'].push([webId,'token2','初訪問者','',new Date(),'承認待ち','未確認','','','','','確認待ち',...Array(9).fill('')]);
 const d={action:'webAdminOpsCreate',operationId:'c'.repeat(32),webId,expectedStatus:'承認待ち'};
 const first=x.exec(d);
 assert.equal(first.mioId,'MIO-0002');
 assert.equal(x.rows['emuzii_参加者'][2][1],'初訪問者');
 assert.equal(x.rows['emuzii_参加者'][1][1],'新しい人');
 assert.equal(x.exec(d).replayed,true);
});

test('first-visit entry logs receipt only; never approves a browser or adds gacha credits',()=>{
 const x=sandbox(),op='c'.repeat(32);
 const item={action:'webAdminOpsIntake',operationId:op,name:'来場テスト',note:'確認中'};
 assert.equal(x.exec(item).status,'管理確認待ち');
 assert.equal(x.exec(item).replayed,true);
 assert.equal(x.rows['emuzii_新規簡易登録'].length,3);
 assert.equal(x.rows['emuzii_Web登録'][1][5],'承認待ち');
 assert.equal(x.rows['emuzii_ガチャ'][1][14],2);
 assert.throws(()=>x.exec({...item,operationId:'d'.repeat(32)}),/同名/);
});

test('grant retry with pending audit repairs missing grant history without re-credit',()=>{
 const x=sandbox(),op='a'.repeat(32),data={action:'webAdminOpsGrant',operationId:op,mioId:'MIO-0001',count:1,expectedSpecial:2,reason:'イベントWeb特典'};
 const result=x.exec(data);
 assert.equal(result.special,3);
 x.rows['emuzii_Web管理操作履歴'][1][7]='処理中';
 x.rows['emuzii_ガチャ付与履歴'].pop();
 const retry=x.exec(data);
 assert.equal(retry.replayed,true);
 assert.equal(x.rows['emuzii_ガチャ'][1][14],3);
 assert.equal(x.rows['emuzii_ガチャ付与履歴'].length,2);
 assert.equal(x.exec(data).replayed,true);
 assert.equal(x.rows['emuzii_ガチャ付与履歴'].length,2);
});

test('after 500 existing grant history rows, repeat operation cannot create another history entry',()=>{
 const x=sandbox(),op='7'.repeat(32),history=x.rows['emuzii_ガチャ付与履歴'];
 for(let i=0;i<520;i++)history.push([new Date(),'MIO-0001','新しい人',1,'古い付与',0,1,1,1,'old-'+i]);
 const data={action:'webAdminOpsGrant',operationId:op,mioId:'MIO-0001',count:1,expectedSpecial:2,reason:'最新イベントWeb付与'};
 assert.equal(x.exec(data).special,3);
 assert.equal(history.length,522);
 x.rows['emuzii_Web管理操作履歴'][1][7]='処理中';
 assert.equal(x.exec(data).replayed,true);
 assert.equal(history.length,522);
 assert.equal(x.rows['emuzii_ガチャ'][1][14],3);
 const latest=x.exec({action:'webAdminOpsRead'});
 assert.equal(latest.grants[0].reason,'最新イベントWeb付与');
 assert.equal(latest.grants[0].count,1);
 assert.equal(latest.grants.length,30);
});

test('Web admin reads pending registrations after the 500th row without leaking tokens',()=>{
 const x=sandbox();
 for(let i=0;i<540;i++){
  const id='MIO-W-'+i.toString(16).padStart(24,'0');
  x.rows['emuzii_Web登録'].push([id,'sensitive-token-'+i,'user'+i,'',new Date(),'承認待ち','未確認','','','','','確認待ち',...Array(9).fill('')]);
 }
 const last=x.rows['emuzii_Web登録'].at(-1);
 const out=x.exec({action:'webAdminOpsRead'});
 assert.equal(out.totalPending,541);
 assert.equal(out.pending[0].webId,last[0]);
 assert.equal(out.pending[0].name,last[2]);
 assert.equal(JSON.stringify(out).includes('sensitive-token-'),false);
});
test('Web admin catches duplicate first-visit intake beyond the 500th record',()=>{
 const x=sandbox(),intake=x.rows['emuzii_新規簡易登録'];
 for(let i=0;i<540;i++)intake.push(['','visitor'+i,'','登録','管理確認待ち','']);
 intake.push(['','後方の来場者','','登録','管理確認待ち','']);
 assert.throws(()=>x.exec({action:'webAdminOpsIntake',operationId:'b'.repeat(32),name:'後方の来場者',note:'再受付'}),/同名/);
 assert.equal(intake.length,543);
 const out=x.exec({action:'webAdminOpsRead'});
 assert.equal(out.simple[0].name,'後方の来場者');
});
test('unexpectedly oversized Web table fails closed, never quietly omits users',()=>{
 const x=sandbox(),web=x.rows['emuzii_Web登録'];
 for(let i=0;i<1000;i++)web.push(['MIO-W-'+i.toString(16).padStart(24,'0')]);
 assert.throws(()=>x.exec({action:'webAdminOpsRead'}),/検証上限/);
 assert.equal(x.write.length,0);
});

test('interrupted approval finalizes only after matching confirmed identity and member verification',()=>{
 const x=sandbox();
 const op='9'.repeat(32);
 const d={action:'webAdminOpsApprove',operationId:op,webId:'MIO-W-1234567890abcdef12345678',mioId:'MIO-0001',memberConfirmed:true,expectedStatus:'承認待ち'};
 assert.equal(x.exec(d).status,'承認済み');
 const log=x.rows['emuzii_Web管理操作履歴'][1];
 log[7]='処理中'; // response lost immediately before final audit commit
 const res=x.exec(d);
 assert.equal(res.replayed,true);
 assert.equal(log[7],'確定');
 assert.equal(x.rows['emuzii_Web登録'][1][7],'MIO-0001');
 assert.equal(x.rows['emuzii_Web登録'][1][5],'承認済み');
 assert.throws(()=>x.exec({...d,memberConfirmed:false}),/操作IDの再利用/);
});
test('interrupted approval does not finalize an inconsistent Web registration',()=>{
 const x=sandbox(),d={action:'webAdminOpsApprove',operationId:'6'.repeat(32),webId:'MIO-W-1234567890abcdef12345678',mioId:'MIO-0001',memberConfirmed:true,expectedStatus:'承認待ち'};
 x.exec(d);
 const log=x.rows['emuzii_Web管理操作履歴'][1];
 log[7]='処理中';
 x.rows['emuzii_Web登録'][1][11]='確認待ち';
 assert.throws(()=>x.exec(d),/前の処理を管理者が確認中/);
 assert.equal(log[7],'処理中');
});

test('confirmed first-visit replay requires exactly one matching receipt and makes no changes',()=>{
 const request={action:'webAdminOpsIntake',operationId:'c'.repeat(32),
  name:'到着者D',note:'本人確認は未実施'};
 for(const scenario of ['missing','changedNote','duplicate','rejected']){
  const x=sandbox();x.exec(request);
  const receipts=x.rows['emuzii_新規簡易登録'];
  if(scenario==='missing')receipts.pop();
  if(scenario==='changedNote')receipts.at(-1)[5]='別件のメモ';
  if(scenario==='duplicate')receipts.push([...receipts.at(-1)]);
  if(scenario==='rejected')receipts.at(-1)[4]='却下';
  const before=JSON.stringify(x.rows),writes=x.write.length;
  assert.throws(()=>x.exec(request),/同じ操作の受付状態を確認してください/,scenario);
  assert.equal(JSON.stringify(x.rows),before);
  assert.equal(x.write.length,writes,'no confirmed replay can recreate the receipt: '+scenario);
 }
 const x=sandbox();x.exec(request);
 const before=JSON.stringify(x.rows),writes=x.write.length;
 assert.equal(x.exec(request).replayed,true);
 assert.equal(JSON.stringify(x.rows),before);
 assert.equal(x.write.length,writes);
});
test('first-visit receipt survives lost response and same-ID retry without duplicate row',()=>{
 const x=sandbox(),d={action:'webAdminOpsIntake',operationId:'1'.repeat(32),name:'到着者A',note:'ガチャのみ'};
 const result=x.exec(d);
 assert.equal(result.status,'管理確認待ち');
 const receiptCount=x.rows['emuzii_新規簡易登録'].length;
 const log=x.rows['emuzii_Web管理操作履歴'][1];
 log[7]='処理中';
 const retry=x.exec(d);
 assert.equal(retry.replayed,true);
 assert.equal(log[7],'確定');
 assert.equal(x.rows['emuzii_新規簡易登録'].length,receiptCount);
 assert.throws(()=>x.exec({...d,note:'別の内容'}),/操作IDの再利用/);
});
test('uncertain receipt remains pending if matching row was modified',()=>{
 const x=sandbox(),d={action:'webAdminOpsIntake',operationId:'2'.repeat(32),name:'到着者B',note:'受付中'};
 x.exec(d);
 const log=x.rows['emuzii_Web管理操作履歴'][1];
 log[7]='処理中';
 const receipt=x.rows['emuzii_新規簡易登録'].at(-1);
 receipt[5]='違う備考';
 assert.throws(()=>x.exec(d),/同じ操作の受付状態を確認/);
 assert.equal(log[7],'処理中');
 assert.equal(x.rows['emuzii_新規簡易登録'].length,3);
});
test('uncertain receipt rejects ambiguous duplicate same-name same-note entries',()=>{
 const x=sandbox(),d={action:'webAdminOpsIntake',operationId:'3'.repeat(32),name:'到着者C',note:'同じ内容'};
 x.exec(d);
 const log=x.rows['emuzii_Web管理操作履歴'][1];
 log[7]='処理中';
 x.rows['emuzii_新規簡易登録'].push([...x.rows['emuzii_新規簡易登録'].at(-1)]);
 assert.throws(()=>x.exec(d),/同じ操作の受付状態を確認/);
 assert.equal(log[7],'処理中');
 assert.equal(x.rows['emuzii_新規簡易登録'].length,4);
});

test('review receipt can be recovered after status changed but audit left pending',()=>{
 const x=sandbox();
 const d={action:'webAdminOpsReview',operationId:'4'.repeat(32),row:2,expectedStatus:'未確認'};
 assert.equal(x.exec(d).status,'確認済み');
 const log=x.rows['emuzii_Web管理操作履歴'][1];
 assert.equal(log[3],'簡易受付:2');
 log[7]='処理中';
 const replay=x.exec(d);
 assert.equal(replay.replayed,true);
 assert.equal(log[7],'確定');
 assert.equal(x.rows['emuzii_新規簡易登録'][1][4],'確認済み');
 assert.equal(x.rows['emuzii_新規簡易登録'].length,2);
});
test('review operation ID may not be reused against another row or person',()=>{
 const x=sandbox();
 const d={action:'webAdminOpsReview',operationId:'5'.repeat(32),row:2,expectedStatus:'未確認'};
 x.exec(d);
 const log=x.rows['emuzii_Web管理操作履歴'][1];
 log[7]='処理中';
 x.rows['emuzii_新規簡易登録'].push(['','別の受付者','','登録','確認済み','']);
 assert.throws(()=>x.exec({...d,row:3}),/操作IDの再利用/);
 assert.equal(log[7],'処理中');
 assert.throws(()=>x.exec({...d,expectedStatus:'管理確認待ち'}),/操作IDの再利用/);
 assert.equal(log[7],'処理中');
});
test('review cannot finalize when registered status changed externally',()=>{
 const x=sandbox();
 const d={action:'webAdminOpsReview',operationId:'6'.repeat(32),row:2,expectedStatus:'未確認'};
 x.exec(d);
 const log=x.rows['emuzii_Web管理操作履歴'][1];
 log[7]='処理中';
 x.rows['emuzii_新規簡易登録'][1][4]='却下';
 assert.throws(()=>x.exec(d),/簡易登録の変更状態/);
 assert.equal(log[7],'処理中');
});

test('actual 38 approved, 1 pending, 2 rejected never inflates approval queue to three',()=>{
 const x=sandbox();
 const web=x.rows['emuzii_Web登録'];
 const original=web[1];
 for(let i=0;i<38;i++){
  const row=[...original];
  row[0]='MIO-W-'+(i+1000).toString(16).padStart(24,'0');
  row[5]='承認済み';row[11]='確認済み';
  web.push(row);
 }
 for(let i=0;i<2;i++){
  const row=[...original];row[0]='MIO-W-'+(i+2000).toString(16).padStart(24,'0');
  row[5]='却下';row[11]='確認待ち';web.push(row);
 }
 const view=x.exec({action:'webAdminOpsRead'});
 assert.equal(view.totalPending,1);
 assert.equal(view.rejectedCount,2);
 assert.equal(view.pending.length,1);
 assert.equal(view.pending[0].status,'承認待ち');
});
test('approved accounts with incomplete identity verification are still shown for review',()=>{
 const x=sandbox();
 x.rows['emuzii_Web登録'][1][5]='承認済み';
 x.rows['emuzii_Web登録'][1][11]='確認待ち';
 const view=x.exec({action:'webAdminOpsRead'});
 assert.equal(view.totalPending,1);
 assert.equal(view.rejectedCount,0);
 assert.equal(view.pending[0].status,'承認済み');
});
