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
  assert.equal(b.el('opsCount').textContent,'未接続');
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
