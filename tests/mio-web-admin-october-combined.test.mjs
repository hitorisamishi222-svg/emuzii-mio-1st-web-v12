import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const full=read('GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs');
const module=read('GAS_WebAdminOps_20261030.gs');
const site=read('mio-admin-ops-code-copy-20261106.html');
const server=read('api-gacha-admin-ops.js');
const legacyMarker='// 2026-11-06: Web admin operations; retains Oct-2026 checkin and existing onsite web gate.';
const route="    if(/^webAdminOps(?:Read|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));\n";
const hash=source=>{
 let value=2166136261>>>0;
 for(let i=0;i<source.length;i++)value=Math.imul(value^source.charCodeAt(i),16777619)>>>0;
 return value.toString(16);
};
test('all original live Code.gs bytes are preserved except one signed management dispatcher',()=>{
 const marker=full.indexOf(legacyMarker);
 assert.ok(marker>0,'new management routines must be appended');
 const live=full.slice(0,marker).replace(route,'').replace(/\n$/,'');
 assert.equal(live.length,38180);
 assert.equal(hash(live),'c2fa0940');
 assert.equal((full.match(/\bfunction doPost\s*\(/g)||[]).length,1);
 assert.equal((full.match(/\bfunction checkinAction_\s*\(/g)||[]).length,1);
 assert.equal((full.match(/\bfunction gachaAction_\s*\(/g)||[]).length,1);
 assert.equal((full.match(/\bfunction gachaWebGateActionInline1030_\s*\(/g)||[]).length,1);
 assert.match(full,/if\(ymd<'2026-10-01'\)/);
 assert.match(full,/ymd\.slice\(0,7\)==='2026-10'&&day>todayDay/);
 assert.doesNotMatch(full,/if\(ymd<'2026-10-01'\|\|ymd>'2026-10-31'\)/);
});
test('19 management functions appended exactly once, module matches reviewed previous source',()=>{
 const segment=full.slice(full.indexOf(legacyMarker)+legacyMarker.length);
 assert.equal(segment.trim(),module.trim());
 const functions=[...module.matchAll(/\bfunction\s+(mioAdminOps\w*_?)\s*\(/g)].map(x=>x[1]);
 assert.equal(functions.length,19);
 for(const name of functions){
  assert.equal((full.match(new RegExp('\\bfunction\\s+'+name+'\\s*\\(','g'))||[]).length,1,name);
 }
 assert.doesNotMatch(module,/\bfunction doPost\(/);
});
test('new route follows the existing BRIDGE_SECRET check inside ScriptLock',()=>{
 const post=full.indexOf('function doPost(e)');
 const lock=full.indexOf('LockService.getScriptLock()',post);
 const secret=full.indexOf("if(!secret||!equal_(d.secret,secret))",post);
 const originalGate=full.indexOf("if(d.action==='webGateRead'||d.action==='webGateSet')",post);
 const ops=full.indexOf(route,post);
 const participant=full.indexOf("if(!/^MIO-W-",post);
 assert.ok(post<lock&&lock<secret&&secret<originalGate&&originalGate<ops&&ops<participant);
 assert.match(full,/finally\s*\{\s*lock\.releaseLock\(\)/);
 assert.match(server,/const RELEASE='verified-existing-gas-ops-20261030'/);
 assert.match(server,/if\(d\.action!=='read'&&!writeEnabled\)/);
 assert.match(server,/authorizedCode\(d\.code,process\.env\.MIO_GACHA_WEB_KEY_SHA256\)/);
 assert.match(server,/sessionOK\(req\)/);
});
test('October 31 date remains selectable while historical 2-try lock and identity checks remain',()=>{
 const func=full.slice(full.indexOf('function checkinAction_(ss,r,d)'),full.indexOf('\nvar PRIZE_TAB='));
 assert.match(func,/getRange\(row,day\+2\)/);
 assert.match(func,/var attempts=checkinAttempts_\(r\[7\],day\)/);
 assert.match(func,/attempts>=CHECKIN_MAX_ATTEMPTS/);
 assert.match(func,/if\(r\[5\]!=='承認済み'\)/);
 assert.match(func,/people.length!==1/);
 assert.match(func,/if\(!equal_\(keyword,expected\)\)/);
});
test('read-only management call can fetch empty sheet snapshots without writing',()=>{
 const names=['emuzii_Web登録','emuzii_参加者','emuzii_ガチャ','emuzii_新規簡易登録','emuzii_ガチャ付与履歴'];
 const reads=[],writes=[];
 const sheet={getLastRow(){return 1;},getRange(){reads.push('range');throw Error('unexpected range');}};
 const ss={getSheetByName(name){reads.push(name);if(!names.includes(name))throw Error('unexpected sheet');return sheet},
  insertSheet(){writes.push('insertSheet');throw Error('cannot create sheet in read test')}};
 const sandbox={Date,Number,String,Math,SpreadsheetApp:{openById(){return ss},flush(){writes.push('flush')}},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput(value){return {setMimeType(){return {text:value}}}}},
  PropertiesService:{getScriptProperties(){return {getProperty(key){return key==='BRIDGE_SECRET'?'offline-only-secret':''}}}},
  LockService:{getScriptLock(){return {tryLock(){return true},releaseLock(){}}}},
 };
 const ctx=vm.createContext(sandbox);
 vm.runInContext(full,ctx,{timeout:2500});
 const response=ctx.doPost({postData:{contents:JSON.stringify({action:'webAdminOpsRead',secret:'offline-only-secret'})}});
 const data=JSON.parse(response.text);
 assert.equal(data.ok,true);
 assert.equal(data.totalPending,0);
 assert.equal(data.pending.length,0);
 assert.equal(data.roster.length,0);
 assert.equal(data.simple.length,0);
 assert.deepEqual(writes,[]);
 assert.ok(names.every(x=>reads.includes(x)));
 const failed=ctx.doPost({postData:{contents:JSON.stringify({action:'webAdminOpsRead',secret:'not-authorized'})}});
 assert.equal(JSON.parse(failed.text).error,'unauthorized');
 assert.deepEqual(writes,[]);
});
test('copy-to-Android page contains exact full source and no external code request',()=>{
 assert.match(site,/Code\.gs 全文をコピーする/);
 assert.match(site,/navigator\.clipboard\.writeText\(t\.value\)/);
 assert.match(site,/本人確認|参加者ID/);
 const source=site.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
 assert.ok(source);
 const decode=s=>s.replace(/&(#\d+|lt|gt|amp|quot|#39);/gi,(_,entity)=>{
  if(entity[0]==='#')return String.fromCharCode(Number(entity.slice(1)));
  return {lt:'<',gt:'>',amp:'&',quot:'"'}[entity.toLowerCase()];
 });
 assert.equal(decode(source),full);
 assert.doesNotMatch(site,/fetch\s*\(|XMLHttpRequest|document\.cookie|localStorage|sessionStorage/);
});
test('legacy audit/idempotency write protections remain in operations module',()=>{
 assert.match(module,/mioAdminOpsExisting_\(/);
 assert.match(module,/mioAdminOpsWriteLog_\(/);
 assert.match(module,/mioAdminOpsRecordGrant_\(/);
 assert.match(module,/Number\.isInteger\(count\)/);
 assert.match(module,/expectedSpecial|expected/);
 assert.match(module,/webIntegrityOk_\(/);
 assert.match(module,/operationId/);
 assert.match(module,/getRange\(row,15\)|getRange\(g\.row,15\)/);
});
