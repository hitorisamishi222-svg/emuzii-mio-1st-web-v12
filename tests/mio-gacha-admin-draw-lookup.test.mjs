import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const get=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const module=get('GAS_WebAdminOps_20261030.gs');
const full=get('GAS_Code_FULL_WEB_OPS_20261030.gs');
const webId='MIO-W-'+'a'.repeat(24),drawId='b'.repeat(32);
function sandbox(){
 let writes=0;
 const web=Array(21).fill('');web[0]=webId;web[1]='token-not-allowed-in-result';
 web[2]='確認済み';web[5]='承認済み';web[7]='MIO-0010';web[11]='確認済み';
 const result=[drawId,webId,'MIO-0010','確認済み','通常','P1','当選景品',1,
  new Date('2026-10-30T11:00:00Z'),2,'確定','SR','https://example.invalid/p.png'];
 const sheets={'emuzii_Web登録':[['header'],web],'emuzii_当選履歴':[['header'],result]};
 const ss={getSheetByName(name){const rows=sheets[name];if(!rows)return null;
  return {getLastRow(){return rows.length},
   getRange(row,col,n=1,k=1){return {
    getValues(){return Array.from({length:n},(_,i)=>Array.from({length:k},(_,j)=>rows[row+i-1]?.[col+j-1]??''))},
    setValue(){writes++},setValues(){writes++}
   }}
  };
 }};
 const ctx={};
 vm.runInNewContext(module,ctx);
 const lookup=(d={})=>JSON.parse(JSON.stringify(ctx.mioAdminOpsDrawLookup_(ss,{webId,drawId,...d})));
 return {lookup,sheets,web,result,writes:()=>writes};
}
test('confirmed draw is returned only for exactly matching Web/MIO IDs',()=>{
 const a=sandbox();
 const out=a.lookup();
 assert.equal(out.status,'confirmed');
 assert.equal(out.webId,webId);
 assert.equal(out.mioId,'MIO-0010');
 assert.equal(out.name,'確認済み');
 assert.equal(out.prize,'当選景品');
 assert.equal(out.ordinal,2);
 assert.equal(out.mode,'通常');
 assert.equal(a.writes(),0);
 assert.ok(!JSON.stringify(out).includes('token-not-allowed-in-result'));
});
test('missing draw does not imply an authorized new draw',()=>{
 const a=sandbox();a.sheets['emuzii_当選履歴'].pop();
 assert.equal(a.lookup().status,'unconfirmed');
 assert.equal(a.writes(),0);
});
test('duplicate or cross-user draw IDs never disclose a prize or spend rights',()=>{
 const a=sandbox();a.sheets['emuzii_当選履歴'].push([...a.result]);
 assert.equal(a.lookup().status,'conflict');
 assert.equal(a.writes(),0);
 const b=sandbox();b.result[1]='MIO-W-'+'c'.repeat(24);
 assert.equal(b.lookup().status,'conflict');
 const c=sandbox();c.result[2]='MIO-0011';
 assert.equal(c.lookup().status,'conflict');
});
test('unapproved or invalid identities are not accepted',()=>{
 const a=sandbox();a.web[5]='承認待ち';
 assert.equal(a.lookup().status,'identity_unverified');
 assert.throws(()=>a.lookup({webId:'invalid'}),/抽選照会ID/);
 assert.throws(()=>a.lookup({drawId:'bad'}),/抽選照会ID/);
});
test('completed-only check, name and ordinal safety',()=>{
 const a=sandbox();a.result[10]='処理中';assert.equal(a.lookup().status,'conflict');
 const b=sandbox();b.result[9]=0;assert.equal(b.lookup().status,'conflict');
 const c=sandbox();c.result[6]='';assert.equal(c.lookup().status,'conflict');
});
test('full replacement candidate contains same read-only lookup, not live GAS',()=>{
 assert.match(full,/function mioAdminOpsDrawLookup_/);
 assert.match(full,/webAdminOpsDrawLookup/);
 assert.match(full,/getRange\(2,1,length,1\)\.getValues\(\)/);
 assert.match(module,/getRange\(2,1,length,1\)\.getValues\(\)/);
});
test('server API requires admin identity and explicit release, never draws',()=>{
 const api=get('api-mio-gacha-result-lookup.js');
 const config=JSON.parse(get('vercel.json'));
 assert.match(api,/authorizedCode\(d\.code/);
 assert.match(api,/sessionOK\(req\)/);
 assert.match(api,/MIO_GACHA_RESULT_LOOKUP_RELEASE/);
 assert.match(api,/webAdminOpsDrawLookup/);
 assert.doesNotMatch(api,/bridge\('draw'/);
 assert.equal(config.routes.find(x=>x.src==='/api/mio-gacha-result-lookup')?.dest,'/api-mio-gacha-result-lookup.js');
 const ui=get('gacha-incident-admin.js');
 assert.match(ui,/当選結果を確認（抽選しない）/);
 assert.match(ui,/verifyCommittedResult/);
});
