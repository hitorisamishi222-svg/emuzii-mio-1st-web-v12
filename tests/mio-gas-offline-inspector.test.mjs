import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../gas-live-version-inspector.html',import.meta.url),'utf8');
const json=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const candidate=readFileSync(new URL('../GAS_Code_OCTOBER_WITH_ADMIN_OPS_20261106.gs',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
const action="    if(/^webAdminOps(?:Read|Member|Approve|Grant|Review|Create|Intake)$/.test(d.action))return json_(mioAdminOps_(SpreadsheetApp.openById(SHEET_ID),d));";
function inspectSource(){
 assert.equal(scripts.length,1);
 const dom={getElementById(){return {addEventListener(){}}}};
 return vm.runInNewContext(scripts[0][1]+'\n;inspect;', {document:dom}, {timeout:1500});
}
test('static offline page is built and routed before catchall',()=>{
 assert.deepEqual(json.builds.filter(b=>b.src==='gas-live-version-inspector.html'),[
  {src:'gas-live-version-inspector.html',use:'@vercel/static'}
 ]);
 assert.deepEqual(json.routes.filter(r=>r.src==='/gas-live-version-inspector.html'),[
  {src:'/gas-live-version-inspector.html',dest:'/gas-live-version-inspector.html'}
 ]);
 const before=json.routes.findIndex(r=>r.src==='/gas-live-version-inspector.html');
 const catchall=json.routes.findIndex(r=>r.src==='/(.*)');
 assert.ok(before>=0&&catchall>before);
});

test('inspector never connects to external sites or persists source',()=>{
 assert.match(html,/default-src 'none'/);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/form-action 'none'/);
 assert.match(html,/noindex,nofollow/);
 assert.doesNotMatch(html,/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\s*\(/);
 assert.doesNotMatch(html,/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
 assert.doesNotMatch(html,/<script\b[^>]*\bsrc=/);
 assert.doesNotMatch(html,/<iframe\b|<form\b|<img\b/i);
 assert.match(html,/publicationAllowed:false/);
 assert.match(html,/writeAllowed:false/);
});

test('synthetic static compatibility succeeds but still never permits deployment',()=>{
 assert.ok(candidate.includes(action));
 const inspect=inspectSource();
 const r=inspect(candidate);
 assert.equal(r.staticallyCompatible,true,JSON.stringify(r));
 assert.equal(r.adminDispatcherPresent,true);
 assert.equal(r.scriptLockGuardOrderOK,true);
 assert.equal(r.missing.length,0);
 assert.equal(r.duplicate.length,0);
});

test('published candidate missing dispatcher cannot be mistaken for editor HEAD',()=>{
 const inspect=inspectSource();
 const r=inspect(candidate.replace(action,''));
 assert.equal(r.staticallyCompatible,false);
 assert.equal(r.adminDispatcherPresent,false);
});

test('missing and duplicate functions stop static compatibility',()=>{
 const inspect=inspectSource();
 const missing=inspect(candidate.replace('function mioAdminOpsRead_(', 'function renamedReader_('));
 assert.equal(missing.staticallyCompatible,false);
 assert.ok(Array.from(missing.missing).includes('mioAdminOpsRead_'));
 const duplicate=inspect(candidate+'\nfunction mioAdminOps_(){}');
 assert.equal(duplicate.staticallyCompatible,false);
 assert.ok(Array.from(duplicate.duplicate).includes('mioAdminOps_'));
});

test('comment-only helpers and unlocked route never pass',()=>{
 const inspect=inspectSource();
 const source=candidate.replace('function safeText_(', 'function fakeHelper_(')+'\n// function safeText_(){}';
 const commented=inspect(source);
 assert.equal(commented.staticallyCompatible,false);
 assert.ok(Array.from(commented.missing).includes('safeText_'));
 const noLock=inspect(candidate.replace('lock.tryLock(10000)','lock.fakeTryLock(10000)'));
 assert.equal(noLock.staticallyCompatible,false);
 assert.equal(noLock.scriptLockGuardOrderOK,false);
});

test('UI only copies the diagnostic object, not the input source',()=>{
 assert.match(html,/safeReport=JSON\.stringify\(summary,null,2\)/);
 assert.match(html,/navigator\.clipboard\?\.writeText\(safeReport\)/);
 assert.doesNotMatch(html,/writeText\(\$\('published'\)/);
});

test('mobile doPost-only input checks routing without claiming helper completeness',()=>{
 const inspect=inspectSource();
 const first=candidate.indexOf('function doPost('),next=candidate.indexOf('\nfunction ',first+15);
 assert.ok(first>=0&&next>first);
 const isolated=candidate.slice(first,next);
 const r=inspect(isolated,'doPost');
 assert.equal(r.sourceCoverage,'DOPOST_ONLY');
 assert.equal(r.hasDoPost,true);
 assert.equal(r.adminDispatcherPresent,true);
 assert.equal(r.dispatchStaticallyCompatible,true);
 assert.equal(r.staticallyCompatible,false);
 assert.equal(r.adminHelpersChecked,false);
 assert.equal(r.missing.length,0);
 const all=inspect(isolated,'all');
 assert.equal(all.staticallyCompatible,false);
 assert.ok(all.missing.length>0);
});

test('missing route in mobile doPost-only snippet cannot be treated as ready',()=>{
 const inspect=inspectSource();
 const first=candidate.indexOf('function doPost('),next=candidate.indexOf('\nfunction ',first+15);
 const isolated=candidate.slice(first,next).replace(action,'');
 const r=inspect(isolated,'doPost');
 assert.equal(r.dispatchStaticallyCompatible,false);
 assert.equal(r.staticallyCompatible,false);
});

test('quoted fake declarations and commented routes never count',()=>{
 const inspect=inspectSource();
 const fake=String.raw`
function mioAdminOpsRead_(){}
`;
 const without=candidate.replace('function mioAdminOpsRead_(', 'function renamedMioReader_(')+
  '\nconst mockGASSource=`'+fake+'`;';
 const r=inspect(without,'all');
 assert.equal(r.staticallyCompatible,false);
 assert.ok(Array.from(r.missing).includes('mioAdminOpsRead_'));
 const withoutRoute=candidate.replace(action,'')+
   '\nconst fakeRoute='+JSON.stringify(action)+';';
 assert.equal(inspect(withoutRoute,'all').adminDispatcherPresent,false);
});


test('admin gate links to same-origin device-only GAS source inspector',()=>{
 const gate=readFileSync(new URL('../gacha-web-gate.html',import.meta.url),'utf8');
 assert.match(gate,/<a href="\/gas-live-version-inspector\.html" target="_blank" rel="noopener noreferrer"/);
 assert.match(gate,/開発Preview専用/);
 assert.match(gate,/コードをチャットやGitHubへ貼らないでください/);
 assert.doesNotMatch(gate,/href="https:\/\/[^"]*gas-live-version-inspector\.html"/);
});
