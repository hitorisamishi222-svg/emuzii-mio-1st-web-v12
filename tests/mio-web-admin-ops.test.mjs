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
  'emuzii_ガチャ付与履歴':[['日時']],
  'emuzii_当選履歴':[['抽選ID']],
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
   getMaxRows(){return 1000},
   getRange(row,col,rs=1,cs=1){
    return {
     getValues(){return Array.from({length:rs},(_,ri)=>Array.from({length:cs},(_,ci)=>rows[name][row+ri-1]?.[col+ci-1]??''))},
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
