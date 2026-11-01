import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=load('gacha-admin-ops.js');
const a=source.indexOf('window.mioResolveIncidentIdentity=function(');
const b=source.indexOf('\nfunction identityUpdated(',a);
assert.ok(a>0&&b>a,'private resolver must exist');
const webId='MIO-W-'+'a'.repeat(24);
function resolver(state){
 const window={};vm.runInNewContext(source.slice(a,b),{window,state});
 return window.mioResolveIncidentIdentity;
}
test('a verified exact Web-ID link displays authoritative name and MIO-ID',()=>{
 const resolve=resolver({webLinks:[{webId,name:'照合済み',mioId:'MIO-0010',verified:true}],pending:[]});
 assert.equal(resolve(webId).name,'照合済み');
 assert.equal(resolve(webId).verified,true);
 assert.equal(resolve(webId).mioId,'MIO-0010');
 assert.equal(resolve('MIO-W-'+'b'.repeat(24)),null);
});
test('unapproved or duplicate entries never appear as verified',()=>{
 const draft={webId,name:'入力名',mioId:'MIO-0030',verified:false};
 const resolve=resolver({webLinks:[draft],pending:[]});
 assert.equal(resolve(webId).verified,false);
 assert.equal(resolve(webId).mioId,'');
 const duplicate=resolver({webLinks:[draft,draft],pending:[]});
 assert.equal(duplicate(webId).status,'conflict');
});
test('legacy GAS without webLinks shows only unverified pending name',()=>{
 const resolve=resolver({pending:[{webId,name:'受付中',mioId:'MIO-0005',linkedName:'別人'}]});
 assert.equal(resolve(webId).name,'受付中');
 assert.equal(resolve(webId).verified,false);
 assert.equal(resolve(webId).mioId,'');
 const duplicate=resolver({pending:[{webId,name:'A'},{webId,name:'B'}]});
 assert.equal(duplicate(webId),null);
});
test('private GAS candidate emits links without exposing token or login ID',()=>{
 const gas=load('GAS_WebAdminOps_20261030.gs');
 const sheets={
  'emuzii_参加者':[['参加者ID','名前'],['MIO-0010','確認済み']],
  'emuzii_ガチャ':[['参加者ID'],['MIO-0010','確認済み']],
  'emuzii_新規簡易登録':[['受付']],
 };
 const ss={getSheetByName(name){const rows=sheets[name];if(!rows)return null;return {
  getLastRow(){return rows.length},
  getRange(row,col,n,k){return {getValues(){return Array.from({length:n},(_,i)=>
   Array.from({length:k},(_,j)=>rows[i+row-1]?.[j+col-1]??''))}}},
 }}};
 const verified=Array(21).fill('');
 verified[0]=webId;verified[1]='secret-token';verified[2]='確認済み';
 verified[5]='承認済み';verified[7]='MIO-0010';verified[11]='確認済み';
 const draft=Array(21).fill('');
 draft[0]='MIO-W-'+'b'.repeat(24);draft[1]='other-secret';draft[2]='未照合名';
 draft[5]='承認待ち';draft[7]='MIO-0010';
 const ctx={};vm.runInNewContext(gas,ctx);
 const output=ctx.mioAdminOpsSummary_(ss,[verified,draft]);
 const links=JSON.parse(JSON.stringify(output.webLinks));
 assert.equal(links.length,2);
 assert.equal(links[0].name,'確認済み');
 assert.equal(links[0].mioId,'MIO-0010');
 assert.equal(links[0].verified,true);
 assert.equal(links[1].name,'未照合名');
 assert.equal(links[1].verified,false);
 assert.equal(links[1].mioId,'');
 assert.ok(!JSON.stringify(output).includes('secret-token'));
 assert.ok(!JSON.stringify(output).includes('other-secret'));
});
test('API returns only sanitized optional links to authenticated operators',()=>{
 const api=load('api-gacha-admin-ops.js');
 assert.match(api,/authorizedCode\(d\.code/);
 assert.match(api,/sessionOK\(req\)/);
 assert.match(api,/result\.webLinks/);
 assert.match(api,/name\.slice\(0,80\)/);
 assert.match(api,/webLinks,grants:/);
});
