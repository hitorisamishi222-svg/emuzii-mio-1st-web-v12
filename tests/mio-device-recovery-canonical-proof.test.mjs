import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const load=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const gas=load('GAS_WebAdminOps_20261030.gs');
const web='MIO-W-'+'a'.repeat(24),token='b'.repeat(64),mio='MIO-0010';
function fixture(){
 const row=Array(21).fill('');
 row[0]=web;row[1]=token;row[2]='確認済み本人';row[5]='承認済み';
 row[7]=mio;row[10]=mio;row[11]='確認済み';
 const people=['emuzii_参加者',[[mio,'確認済み本人']]],webSheet=['emuzii_Web登録',[row]];
 const sheets={};
 for(const [name,rows]of [people,webSheet])sheets[name]=rows;
 let writes=0;
 const ss={getSheetByName(name){
  const rows=sheets[name];if(!rows)return null;
  return {getLastRow(){return rows.length+1},
   getRange(r,c,n,k){return {
    getValues(){return Array.from({length:n},(_,i)=>Array.from({length:k},(_,j)=>rows[i+r-2]?.[j+c-1]??''))},
    setValue(){writes++},setValues(){writes++}
   }}
  };
 }};
 const ctx={webIntegrityOk_:r=>r[10]===r[7]};
 vm.runInNewContext(gas,ctx);
 const lookup=d=>JSON.parse(JSON.stringify(ctx.mioAdminOpsRecoveryProof_(ss,d)));
 return {lookup,ss,row,sheets,writes:()=>writes};
}
test('private GAS proof requires exact Web ID, original token hash and matching MIO ID',()=>{
 const f=fixture();
 const p=f.lookup({participantId:web,tokenHash:token});
 assert.deepEqual(p,{ok:true,verified:true,participantId:web,integratedParticipantId:mio,name:'確認済み本人'});
 assert.equal(f.writes(),0);
 assert.equal(f.lookup({participantId:web,tokenHash:'c'.repeat(64)}).verified,false);
 assert.equal(f.lookup({participantId:'MIO-W-'+'c'.repeat(24),tokenHash:token}).verified,false);
 assert.ok(!JSON.stringify(p).includes(token));
});
test('block legacy, unapproved, master-ID mismatch and duplicate active IDs',()=>{
 const changes=[
  f=>{f.row[5]='承認待ち'},
  f=>{f.row[11]='確認待ち'},
  f=>{f.row[16]='旧端末'},
  f=>{f.row[10]='MIO-0002'},
  f=>{f.row[7]='MIO-0002'},
  f=>{f.sheets['emuzii_参加者'][0][1]='別の人'},
  f=>{const same=Array(21).fill('');same[0]='MIO-W-'+'d'.repeat(24);same[5]='承認済み';same[7]=mio;f.sheets['emuzii_Web登録'].push(same)},
  f=>{f.sheets['emuzii_Web登録'].push([...f.row])}
 ];
 for(const apply of changes){
  const f=fixture();apply(f);
  assert.deepEqual(f.lookup({participantId:web,tokenHash:token}),{ok:true,verified:false});
  assert.equal(f.writes(),0);
 }
});
test('canonical GAS proof is a proposal only; reviewed full Code.gs remains unchanged',()=>{
 const full=load('GAS_Code_FULL_WEB_OPS_20261030.gs');
 assert.doesNotMatch(full,/mioAdminOpsRecoveryProof_/);
 assert.match(gas,/webAdminOpsRecoveryProof/);
 const core=load('mio-device-recovery-core.js');
 assert.match(core,/webAdminOpsRecoveryProof/);
 assert.match(core,/GAS_CANONICAL_ID_MISMATCH/);
 const api=load('api-mio-device-recovery-client.js');
 assert.match(api,/COOKIE_IDENTITY_CONFLICT/);
 assert.match(api,/redeemRecovery/);
 const ui=load('mio-device-recovery-ui.js');
 assert.match(ui,/LINE・X/);
 assert.match(ui,/active&&polling&&!busy/);
 assert.match(api,/redeemed_at>now\(\)-interval '2 minutes'/);
});
