import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../GAS_WebAdminOps_20261030.gs',import.meta.url),'utf8');
function sandbox(){
 const rows={
  'emuzii_Web登録':[['Web参加ID'],['MIO-W-1234567890abcdef12345678','token','新しい人','',new Date(),'承認待ち','未確認','MIO-0001','','','','確認待ち',...Array(9).fill('')]],
  'emuzii_参加者':[['参加者ID'],['MIO-0001','新しい人']],
  'emuzii_ガチャ':[['参加者ID'],['MIO-0001','新しい人',0,0,0,2,0,2,0,0,0,'','OK','OK',2,0,'解放']],
  'emuzii_新規簡易登録':[['登録日時'],['','初訪問者','MIO-W-222222222222222222222222','登録','未確認','']]
 };
 const write=[];
 const ss={
  getSheetByName(n){return rows[n]?sheet(n):null},
  insertSheet(n){rows[n]=[];return sheet(n)}
 };
 function sheet(name){
  return {
   getLastRow(){return rows[name].length},
   getRange(row,col,rs=1,cs=1){
    return {
     getValues(){return Array.from({length:rs},(_,ri)=>Array.from({length:cs},(_,ci)=>rows[name][row+ri-1]?.[col+ci-1]??''))},
     getValue(){return rows[name][row-1]?.[col-1]??''},
     setValue(v){if(!rows[name][row-1])rows[name][row-1]=[];rows[name][row-1][col-1]=v;write.push({name,row,col,v});return this},
     setValues(matrix){for(let ri=0;ri<matrix.length;ri++)for(let ci=0;ci<matrix[ri].length;ci++){if(!rows[name][row+ri-1])rows[name][row+ri-1]=[];rows[name][row+ri-1][col+ci-1]=matrix[ri][ci];write.push({name,row:row+ri,col:col+ci+0,v:matrix[ri][ci]})}return this}
    };
   },
   setFrozenRows(){}
  };
 }
 const context={SpreadsheetApp:{flush(){}},console,Date};
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
test('grant updates only special count and writes idempotent audit',()=>{
 const x=sandbox(),op='e'.repeat(32),grant={action:'webAdminOpsGrant',operationId:op,mioId:'MIO-0001',count:2,expectedSpecial:2,reason:'イベント特別付与'};
 const first=x.exec(grant);
 assert.equal(first.special,4);
 assert.equal(x.rows['emuzii_ガチャ'][1][14],4);
 assert.equal(x.exec(grant).replayed,true);
 assert.equal(x.rows['emuzii_Web管理操作履歴'].length,2);
 assert.throws(()=>x.exec({...grant,operationId:'f'.repeat(32),expectedSpecial:2}),/変更されています/);
 assert.equal(x.rows['emuzii_ガチャ'][1][14],4);
 assert.equal(x.write.some(x=>x.name==='emuzii_当選履歴'),false);
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
 assert.throws(()=>other.exec(d),/名前が一致しません/);
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
