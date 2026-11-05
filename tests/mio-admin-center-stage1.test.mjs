import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../'+name, import.meta.url), 'utf8');
const html = read('gacha-web-gate.html');
const source = read('gacha-admin-ops.js');
const passkey = read('gacha-passkey-ui.js');

test('admin gate mounts the existing operator module with every required UI control', () => {
  assert.match(html, /<script src="\/gacha-admin-ops\.js" defer><\/script>/);
  const names = ['opsStatus','opsInstallGuide','opsSetupToggle','opsReload','opsGrant',
    'opsIntakeCreate','opsPending','opsSimple','opsGrants','opsCount','opsSearch',
    'opsRoster','opsPerson','opsQuantity','opsReason','opsNewName','opsNewNote',
    'opsRetry','opsRetryInfo','opsBell'];
  for (const name of names) assert.ok(html.includes('id="'+name+'"'), 'missing '+name);
  for (const field of ['code','normal','fest','passkeyLogin','passkeyRegister']) {
    assert.ok(html.includes('id="'+field+'"'), 'original gate missing '+field);
  }
  assert.match(html, /mio:admin-connected/);
  assert.match(passkey, /passkeyLogin/); // Face ID source unchanged; gate read connects via existing browser session
  assert.match(source, /mio:admin-connected/);
  assert.match(source, /30000/);
});
test('admin gate retains restricted writes and preserves draw routes', () => {
  const api=read('api-gacha-admin-ops.js');
  assert.match(api,/MIO_GACHA_ADMIN_OPS_RELEASE/);
  assert.match(api,/authorizedCode/);
  assert.match(api,/sessionOK/);
  const config=JSON.parse(read('vercel.json'));
  assert.equal(config.routes.find(x=>x.src==='/api/gacha')?.dest, '/api-gacha.js');
  assert.equal(config.routes.find(x=>x.src==='/api/gacha-admin-ops')?.dest, '/api-gacha-admin-ops.js');
  assert.equal(config.routes.find(x=>x.src==='/gacha-web-gate.html')?.dest, '/gacha-web-gate.html');
});

function fakeBrowser() {
  const nodes=new Map(),events=new Map(),intervals=[],requests=[];
  class Element {
    constructor(tag){this.tagName=tag;this.events=new Map();this.children=[];this.disabled=false;this.hidden=false;this.value='';this.textContent='';this.className='';}
    append(...v){this.children.push(...v)}
    replaceChildren(...v){this.children=[...v]}
    addEventListener(k,fn){this.events.set(k,fn)}
    setAttribute(k,v){this[k]=v}
    click(){const fn=this.events.get('click');if(fn)return fn()}
  }
  const el=id=>{if(!nodes.has(id))nodes.set(id,new Element('div'));return nodes.get(id)};
  const document={
    hidden:false,activeEditor:false,
    getElementById:el,createElement:tag=>new Element(tag),
    querySelector(){return this.activeEditor?{tagName:'INPUT'}:null},
    addEventListener(k,fn){events.set('document:'+k,fn)}
  };
  const window={
    addEventListener(k,fn){events.set('window:'+k,fn)},
    setInterval(fn,ms){intervals.push({fn,ms})},confirm(){throw Error('unexpected write')}
  };
  let next={ok:true,writeEnabled:false,roster:[],simple:[],grants:[],pending:[],totalPending:0,rejectedCount:0};
  const context={document,window,sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},
    snapshot:null,code:'',fetch:async(p,o)=>{requests.push({p,o});return {ok:true,json:async()=>next}},
    crypto:{getRandomValues(b){return b}},console};
  vm.runInNewContext(source,context);
  return {
    el,document,requests,intervals,
    connect(){context.snapshot={normalOpen:false,festOpen:false};events.get('window:mio:admin-connected')()},
    setSnapshot:record=>{next=record},
    async settled(){await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))}
  };
}
function flatten(root) {
  return [root,...root.children.flatMap(flatten)];
}
test('no participant record is fetched before administrator connection', async () => {
  const b=fakeBrowser();
  await b.settled();
  assert.equal(b.requests.length,0);
  assert.equal(b.el('opsPending').children.length,0,'no private rows before login');
});
test('authenticated read shows pending alert and allows viewing roster while writes are disabled', async () => {
  const b=fakeBrowser();
  b.setSnapshot({ok:true,writeEnabled:false,totalPending:1,rejectedCount:0,
    pending:[{name:'見本',webId:'MIO-W-123456789012345678901234',status:'承認待ち',mioId:'MIO-0001'}],
    roster:[{name:'見本',mioId:'MIO-0001',gacha:{checked:true,total:2,remaining:2,special:0}}],
    simple:[],grants:[]});
  b.connect();await b.settled();
  assert.match(b.el('opsBell').textContent,/承認待ち 1 件/);
  const choose=flatten(b.el('opsRoster')).find(x=>x.tagName==='button');
  assert.ok(choose,'read-only roster selection missing');
  assert.equal(choose.disabled,false,'roster selection must work without write release');
  assert.equal(b.el('opsGrant').disabled,true,'grant must stay disabled without owner release');
  const approve=flatten(b.el('opsPending')).find(x=>x.tagName==='button');
  assert.equal(approve.disabled,true,'approval must stay disabled without owner release');
  assert.equal(b.requests.length,1);
});
test('polling updates bell without erasing a focused operator input',async()=>{
  const b=fakeBrowser();
  b.setSnapshot({ok:true,writeEnabled:false,totalPending:0,roster:[],simple:[],pending:[],grants:[]});
  b.connect();await b.settled();
  assert.equal(b.intervals.length,1);
  assert.equal(b.intervals[0].ms,30000);
  const oldChildren=b.el('opsPending').children;
  b.el('opsSearch').value='検索途中';
  b.document.activeEditor=true;
  b.setSnapshot({ok:true,writeEnabled:false,totalPending:2,roster:[],simple:[],pending:[],grants:[]});
  b.intervals[0].fn();await b.settled();
  assert.match(b.el('opsBell').textContent,/新しい承認待ち 2 件/);
  assert.equal(b.el('opsSearch').value,'検索途中');
  assert.equal(b.el('opsPending').children,oldChildren,'editing UI must stay mounted');
  b.document.hidden=true;
  b.intervals[0].fn();await b.settled();
  assert.equal(b.requests.length,2,'background tab must not poll');
});

test('quick gacha operator workflow keeps existing gates and avoids unsafe GAS replacement', () => {
  for (const id of ['opsQuickPanel','opsQuickSummary','opsQuickIntake','opsQuickApproval',
    'opsQuickGrant','opsQuickGate','opsOnlyRemaining','opsRemainingSummary']) {
    assert.ok(html.includes('id="'+id+'"'), 'missing quick operator control: '+id);
  }
  assert.match(html, /href="\/gacha\.html"/);
  assert.match(html, /現行のCode\.gsを全文置換しないでください/);
  assert.doesNotMatch(html, /Code\.gsの全貼り付け（部分追加なし）/);
  assert.match(source, /mio:gate-state-changed/);
  assert.match(source, /メンシプ照合結果を選択（必須）/);
  assert.match(source, /member\.value='';/);
});
test('quick operator reads remaining eligible candidates without granting or bypassing membership', async () => {
  const b=fakeBrowser();
  b.setSnapshot({ok:true,writeEnabled:false,totalPending:1,rejectedCount:0,
    roster:[
      {name:'参加者A',mioId:'MIO-0001',gacha:{checked:true,total:3,remaining:2,special:0}},
      {name:'参加者B',mioId:'MIO-0002',gacha:{checked:true,total:3,remaining:0,special:0}},
      {name:'参加者C',mioId:'MIO-0003',gacha:{checked:false,total:2,remaining:2,special:0}}
    ],
    pending:[{name:'参加者D',webId:'MIO-W-123456789012345678901234',
      status:'承認待ち',mioId:'MIO-0004',member:'未確認'}],
    simple:[],grants:[]});
  b.connect();await b.settled();
  assert.match(b.el('opsQuickSummary').textContent,/登録承認待ち 1件/);
  assert.match(b.el('opsQuickSummary').textContent,/既存ガチャ残回数あり 1名/);
  assert.match(b.el('opsQuickSummary').textContent,/管理書込 停止中/);
  assert.match(b.el('opsQuickSummary').textContent,/残回数あり＝抽選許可ではありません/);
  assert.equal(b.el('opsGrant').disabled,true);
  b.el('opsOnlyRemaining').checked=true;
  b.el('opsOnlyRemaining').events.get('change')();
  const buttons=flatten(b.el('opsRoster')).filter(x=>x.tagName==='button');
  assert.equal(buttons.length,1);
  assert.match(buttons[0].textContent,/参加者A/);
  const member=flatten(b.el('opsPending')).find(x=>x.tagName==='select');
  assert.ok(member,'membership confirmation dropdown required');
  assert.equal(member.value,'','operator must explicitly confirm member status');
  assert.equal(b.requests.length,1,'read-only interaction must not write to server');
});
test('operator cannot approve without explicitly choosing the membership result',async()=>{
  const b=fakeBrowser();
  b.setSnapshot({ok:true,writeEnabled:true,totalPending:1,rejectedCount:0,roster:[],
    pending:[{name:'試験参加者',webId:'MIO-W-123456789012345678901234',
      status:'承認待ち',mioId:'MIO-0004',member:'確認済み'}],simple:[],grants:[]});
  b.connect();await b.settled();
  const approve=flatten(b.el('opsPending')).find(x=>x.tagName==='button'&&/本人照合して承認/.test(x.textContent));
  assert.ok(approve);
  assert.equal(approve.disabled,false);
  await approve.click();
  assert.match(b.el('opsStatus').textContent,/現場確認スイッチ/);
  const onsite=flatten(b.el('opsPending')).find(x=>x.tagName==='input');
  assert.ok(onsite);
  onsite.checked=true;
  await approve.click();
  assert.match(b.el('opsStatus').textContent,/メンシプ照合結果を管理者が選択してください/);
  assert.equal(b.requests.length,1,'no approval request without manual membership selection');
});

test('the real admin API blocks on-site writes without explicit verification',async()=>{
 const api=read('api-gacha-admin-ops.js')
   .replace(/^import .*;$/gm,'')
   .replace('export default async function handler','async function handler')+
   '\n globalThis.__handler=handler;';
 let calls=[],authorized=true;
 const context={
  process:{env:{MIO_GACHA_ONSITE_RELEASE:'operator-verified-onsite-20261105'}},
  prepare:()=>({}),authorizedCode:()=>authorized,sessionOK:async()=>false,
  bridge:async(action,data)=>{calls.push({action,data});return action==='webAdminOpsRead'?
   {ok:true,pending:[],roster:[],simple:[],grants:[],totalPending:0,rejectedCount:0}:
   {ok:true,mioId:'MIO-0048',status:'承認済み'}},
  console:{error(){}}
 };
 vm.runInNewContext(api,context);
 const run=async(body)=>{
  const req={headers:{host:'emuzii-mio-1st-web-v12.vercel.app',
   origin:'https://emuzii-mio-1st-web-v12.vercel.app',
   'content-type':'application/json'},body};
  const output={status:0,payload:null};
  const res={setHeader(){},status(n){output.status=n;return this},json(j){output.payload=j;return this}};
  await context.__handler(req,res);return output;
 };
 const approval={code:'test-admin-secret-is-mocked',action:'approve',
  webId:'MIO-W-123456789012345678901234',mioId:'MIO-0048',
  expectedStatus:'承認待ち',memberConfirmed:true,operationId:'a'.repeat(32)};
 let result=await run(approval);
 assert.equal(result.status,400,'onsite approval denied without person switch');
 assert.equal(calls.length,0);
 result=await run({...approval,onSiteVerified:true});
 assert.equal(result.status,200,'per-person attestation may reach existing GAS');
 assert.equal(calls.length,1);
 assert.equal(calls[0].action,'webAdminOpsApprove');
 assert.equal(calls[0].data.mioId,'MIO-0048');
 const grant={code:approval.code,action:'grant',mioId:'MIO-0048',count:2,
  expectedSpecial:0,reason:'現場確認の検証',operationId:'b'.repeat(32)};
 result=await run(grant);
 assert.equal(result.status,400,'no blind additional grant');
 assert.equal(calls.length,1);
 result=await run({...grant,onSiteVerified:true});
 assert.equal(result.status,200);
 assert.equal(calls.length,2);
 authorized=false;
 result=await run({...approval,onSiteVerified:true});
 assert.equal(result.status,403,'operator login always required');
 assert.equal(calls.length,2);
 context.process.env.MIO_GACHA_ONSITE_RELEASE='';
 authorized=true;
 result=await run({...approval,onSiteVerified:true});
 assert.equal(result.status,503,'field release must be intentionally enabled');
 assert.equal(calls.length,2);
 result=await run({code:approval.code,action:'read'});
 assert.equal(result.status,200,'authenticated read does not require write release');
 assert.equal(result.payload.writeMode,'locked');
});

test('GAS incompatibility stops automatic polling but allows manual recovery check',async()=>{
 const b=fakeBrowser();
 b.setSnapshot({ok:false,code:'GAS_UPDATE_REQUIRED',
  error:'既存GASの運営管理連携が未更新です'});
 b.connect();await b.settled();
 assert.equal(b.requests.length,1,'initial authenticated read attempted once');
 assert.match(b.el('opsStatus').textContent,/管理者の認証は通過/);
 assert.match(b.el('opsStatus').textContent,/自動再取得を停止/);
 b.intervals[0].fn();await b.settled();
 assert.equal(b.requests.length,1,'known unsupported GAS must not be polled every 30 sec');
 b.setSnapshot({ok:true,writeEnabled:false,totalPending:0,roster:[],pending:[],simple:[],grants:[]});
 await b.el('opsReload').click();await b.settled();
 assert.equal(b.requests.length,2,'operator can retry manually after GAS update');
 b.intervals[0].fn();await b.settled();
 assert.equal(b.requests.length,3,'successful read resumes polling');
});

test('operator can find a known customer by ColorSing name without typing a login ID',async()=>{
 const b=fakeBrowser();
 b.setSnapshot({ok:true,writeEnabled:true,totalPending:1,
  roster:[{name:'ユーリ',mioId:'MIO-0017',gacha:{checked:true,total:2,remaining:2,special:0}}],
  pending:[{name:'ユーリ',webId:'MIO-W-123456789012345678901234',mioId:'',status:'承認待ち'}],
  simple:[],grants:[]});
 b.connect();await b.settled();
 const wrap=b.el('opsPending'),elements=flatten(wrap);
 const choice=elements.find(x=>x.tagName==='select'&&/本人確認した既存参加者/.test(x['aria-label']||''));
 assert.ok(choice,'existing participant chooser must appear');
 assert.equal(choice.value,'','name search must never automatically verify person');
 assert.ok(choice.children.some(x=>x.value==='MIO-0017'&&/ユーリ/.test(x.textContent)),
  'operator can choose the original MIO ID from roster');
 assert.equal(elements.filter(x=>x.tagName==='button'&&/新規作成/.test(x.textContent)).length,0,
  'interrupted registration must not offer a duplicate new ID');
 const approve=elements.find(x=>x.tagName==='button'&&/本人照合して承認/.test(x.textContent));
 const onsite=elements.find(x=>x.tagName==='input');onsite.checked=true;
 const member=elements.find(x=>x.tagName==='select'&&/メンシプ確認/.test(x['aria-label']||''));member.value='yes';
 await approve.click();
 assert.match(b.el('opsStatus').textContent,/候補から選択してください/);
 assert.equal(b.requests.length,1,'no identity approval based on nickname alone');
});
test('existing linked MIO-ID mismatch stops onsite approval before any write',async()=>{
 const b=fakeBrowser();
 b.setSnapshot({ok:true,writeEnabled:true,totalPending:1,
  roster:[{name:'試験参加者',mioId:'MIO-0002',gacha:{checked:true,total:1,remaining:1,special:0}}],
  pending:[{name:'試験参加者',webId:'MIO-W-123456789012345678901234',mioId:'MIO-0001',status:'承認待ち'}],
  simple:[],grants:[]});
 b.connect();await b.settled();
 const elements=flatten(b.el('opsPending'));
 const onsite=elements.find(x=>x.tagName==='input');onsite.checked=true;
 const member=elements.find(x=>x.tagName==='select'&&/メンシプ確認/.test(x['aria-label']||''));member.value='yes';
 const choice=elements.find(x=>x.tagName==='select'&&/本人確認した既存参加者/.test(x['aria-label']||''));choice.value='MIO-0002';
 const approve=elements.find(x=>x.tagName==='button'&&/本人照合して承認/.test(x.textContent));
 await approve.click();
 assert.match(b.el('opsStatus').textContent,/MIO-IDと選択した参加者が一致しません/);
 assert.equal(b.requests.length,1,'no cross-person linking possible from UI');
});
