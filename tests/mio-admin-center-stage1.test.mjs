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
  assert.match(passkey, /mio:admin-connected/);
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
  assert.match(b.el('opsStatus').textContent,/先に現場確認スイッチ/);
  const onsite=flatten(b.el('opsPending')).find(x=>x.tagName==='input');
  assert.ok(onsite,'individual onsite switch required');
  onsite.checked=true;
  await approve.click();
  assert.match(b.el('opsStatus').textContent,/メンシプ照合結果を管理者が選択してください/);
  assert.equal(b.requests.length,1,'no approval request without onsite and membership checks');
});

test('person readiness diagnosis keeps membership and browser possession unverified',async()=>{
  const b=fakeBrowser();
  b.setSnapshot({ok:true,writeEnabled:false,totalPending:0,rejectedCount:0,
    roster:[{name:'運営試験',mioId:'MIO-0088',gacha:{checked:true,total:5,remaining:3,special:0}}],
    webLinks:[{name:'運営試験',webId:'MIO-W-123456789012345678901234',mioId:'MIO-0088',verified:true}],
    simple:[],pending:[],grants:[]});
  b.connect();await b.settled();
  const select=flatten(b.el('opsRoster')).find(x=>x.tagName==='button');
  assert.ok(select);
  await select.click();
  const message=b.el('opsSelectedCheck').textContent;
  assert.match(message,/照合済みの登録あり/);
  assert.match(message,/メンシプ購入：この一覧だけでは判定不可/);
  assert.match(message,/残回数：3回（台帳上）/);
  assert.match(message,/受付OFF/);
  assert.match(message,/抽選許可・本人認証・メンシプ資格の自動付与ではありません/);
  assert.equal(b.requests.length,1,'person diagnostics cannot create a write request');
});
test('simple visitor intake is explicitly not a membership draw registration',()=>{
  assert.match(html,/初訪問の簡易受付だけではガチャを解放できません/);
  assert.match(html,/簡易登録.*ガチャの本人認証にはなりません/);
  assert.match(html,/href="\/join\.html"/);
  assert.match(html,/id="opsSelectedCheck"/);
});

test('quick priority list highlights missing Web identity before remaining balance and never writes',async()=>{
  const b=fakeBrowser();
  b.setSnapshot({ok:true,writeEnabled:false,totalPending:0,rejectedCount:0,
    roster:[
      {name:'本人照合済み候補',mioId:'MIO-0001',gacha:{checked:true,total:4,remaining:4,special:0}},
      {name:'途中登録候補',mioId:'MIO-0002',gacha:{checked:true,total:2,remaining:2,special:0}},
      {name:'残数なし',mioId:'MIO-0003',gacha:{checked:true,total:5,remaining:0,special:0}}
    ],
    webLinks:[{name:'本人照合済み候補',webId:'MIO-W-123456789012345678901234',mioId:'MIO-0001',verified:true}],
    pending:[],simple:[],grants:[]});
  b.connect();await b.settled();
  const cards=b.el('opsQuickList').children;
  assert.equal(cards.length,2,'only positive confirmed balances included');
  assert.match(flatten(cards[0]).map(x=>x.textContent).join(' '),/途中登録候補/);
  assert.match(flatten(cards[0]).map(x=>x.textContent).join(' '),/登録途中・旧登録の可能性あり/);
  const choose=flatten(cards[0]).find(x=>x.tagName==='button');
  await choose.click();
  assert.match(b.el('opsSelectedCheck').textContent,/MIO-0002/);
  assert.equal(b.requests.length,1,'read-only investigation cannot issue a write');
});
test('pending legacy duplicate cannot create a new MIO-ID by shortcut',async()=>{
  const b=fakeBrowser();
  b.setSnapshot({ok:true,writeEnabled:true,totalPending:1,rejectedCount:0,
    roster:[{name:'登録途中の利用者',mioId:'MIO-0017',gacha:{checked:true,total:2,remaining:2,special:0}}],
    pending:[{name:'登録途中の利用者',status:'承認待ち',webId:'MIO-W-123456789012345678901234',
      mioId:'',member:'未確認'}],simple:[],grants:[]});
  b.connect();await b.settled();
  const wrap=b.el('opsPending');
  assert.match(flatten(wrap).map(x=>x.textContent).join(' '),/新規IDを作成せず/);
  assert.equal(flatten(wrap).filter(x=>x.tagName==='button'&&/新規作成/.test(x.textContent)).length,0);
  assert.equal(b.requests.length,1,'new participant must never be issued from a name coincidence');
});

test('an onsite operator release is separate from full rollout and requires attestation',()=>{
 const api=read('api-gacha-admin-ops.js');
 assert.match(api,/MIO_GACHA_ONSITE_RELEASE/);
 assert.match(api,/operator-verified-onsite-20261105/);
 assert.match(api,/onsiteEnabled&&!standardEnabled/);
 assert.match(api,/d\.onSiteVerified!==true/);
 assert.match(api,/writeMode/);
 assert.match(api,/authorizedCode\(d\.code/);
 assert.match(api,/sessionOK\(req\)/);
 assert.match(html,/id="opsOnsiteGrantVerified"/);
 assert.match(source,/onSiteVerified:true/);
});
test('grant switch defaults to off even for verified participant until onsite check',async()=>{
 const b=fakeBrowser();
 b.setSnapshot({ok:true,writeEnabled:true,writeMode:'onsite',totalPending:0,rejectedCount:0,
   roster:[{name:'試験参加者',mioId:'MIO-0048',gacha:{checked:true,total:2,remaining:2,special:0}}],
   pending:[],simple:[],grants:[]});
 b.connect();await b.settled();
 const person=flatten(b.el('opsRoster')).find(x=>x.tagName==='button');
 await person.click();
 assert.equal(b.el('opsGrant').disabled,true,'onsite check must precede individual grant');
 b.el('opsOnsiteGrantVerified').checked=true;
 b.el('opsOnsiteGrantVerified').events.get('change')();
 assert.equal(b.el('opsGrant').disabled,false,'manually checked person can proceed to confirmation');
 assert.equal(b.requests.length,1,'a switch alone never makes a backend write');
});
