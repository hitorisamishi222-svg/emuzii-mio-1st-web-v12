import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const legacy=readFileSync(join(root,'APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs'),'utf8');
const expected=readFileSync(join(root,'APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs'),'utf8');
const script=join(root,'tools/prepare-gas-scoped-merge.mjs');
const launch=(source)=>{
  const dir=mkdtempSync(join(tmpdir(),'mio-gas-patch-test-'));
  const input=join(dir,'Code.gs'),output=join(dir,'Code.review.gs');
  writeFileSync(input,source,'utf8');
  const result=spawnSync(process.execPath,[script,input,output],{encoding:'utf8'});
  const out=existsSync(output)?readFileSync(output,'utf8'):null;
  const original=readFileSync(input,'utf8');
  rmSync(dir,{recursive:true,force:true});
  return {status:result.status,stdout:result.stdout,stderr:result.stderr,out,original};
};

test('legacy baseline produces registration-only review candidate with October checkin byte-for-byte intact',()=>{
  // v1.9.6 is a multi-purpose candidate: its October checkin edits are NOT
  // allowed to sneak into a registration-only offline review.
  const tail=source=>source.slice(source.indexOf('\nfunction checkinAction_('));
  assert.notEqual(tail(expected),tail(legacy),'repaired source has unrelated checkin changes');
  const result=launch(legacy);
  assert.equal(result.status,0,result.stderr);
  const registrationPrefix=expected.slice(0,expected.indexOf('\nfunction checkinAction_('));
  assert.equal(result.out,registrationPrefix+tail(legacy),'only the reviewed prefix may change');
  assert.equal(tail(result.out),tail(legacy));
  assert.equal(result.original,legacy,'original Code.gs remains untouched');
});
test('independent operator edits in checkin and gacha remain byte-for-byte unchanged by scoped review',()=>{
  const needle='function checkinAction_(ss,r,d){';
  assert.equal(legacy.split(needle).length,2);
  const current=legacy.replace(needle,needle+'\n  // Independent operator note: keep old checkin and gacha.');
  const result=launch(current);
  assert.equal(result.status,0,result.stderr);
  const tail=source=>source.slice(source.indexOf('\nfunction checkinAction_('));
  assert.equal(tail(result.out),tail(current));
  assert.ok(result.out.includes('// Independent operator note'));
  assert.equal(result.original,current);
});
test('already reviewed repair is a no-op merge and preserves all Code.gs bytes',()=>{
  const result=launch(expected);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.out,expected);
  assert.equal(result.original,expected);
});

test('conflicting edits to the registration block require review, not an automatic overwrite',()=>{
  const needle="if(d.action==='register') {";
  assert.equal(legacy.split(needle).length,2);
  // Conflict is in the exact block modified by the fix.
  const current=legacy.replace(needle,needle+"\n      if(d.cannotModifyThisProject)return json_({ok:false,error:'operator change'});");
  const result=launch(current);
  assert.notEqual(result.status,0);
  assert.equal(result.out,null);
});
test('wrong sheet ID fails closed, never produces a file',()=>{
  const current=legacy.replace('1WqkXSV_','NOT_THE_PROD_');
  assert.notEqual(current,legacy);
  const result=launch(current);
  assert.notEqual(result.status,0);
  assert.equal(result.out,null);
});
test('input and output are never permitted to point to the same file',()=>{
  const temp=mkdtempSync(join(tmpdir(),'mio-gas-samefile-'));
  try{
    const input=join(temp,'Code.gs');
    writeFileSync(input,legacy,'utf8');
    const output=spawnSync(process.execPath,[script,input,input],{encoding:'utf8'});
    assert.notEqual(output.status,0);
    assert.equal(readFileSync(input,'utf8'),legacy);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
