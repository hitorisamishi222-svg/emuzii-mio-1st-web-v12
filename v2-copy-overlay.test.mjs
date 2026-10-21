import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';

const source=readFileSync(new URL('./asahi-panel-v3.js',import.meta.url),'utf8');
const html=readFileSync(new URL('./asahi-copy-overlay.html',import.meta.url),'utf8');

test('Safari installer contains a fully local executable bookmarklet',()=>{
 const line=html.split('\n').find(x=>x.startsWith('const BOOKMARKLET = '));
 assert.ok(line,'installer must include self-contained bookmarklet');
 const b=JSON.parse(line.slice('const BOOKMARKLET = '.length).replace(/;$/,''));
 assert.ok(b.startsWith('javascript:(function(){'));
 assert.ok(b.includes('window.AsahiPanelInstall();'));
 assert.ok(!b.includes('http://')&&!b.includes('https://'),'bookmarklet must not request a remote script');
 new Script(b.slice('javascript:'.length),{filename:'safari-bookmarklet.js'});
});

test('on-page panel installs, can be closed and re-opened',()=>{
 const nodes=new Map();
 function el(id){
  if(!nodes.has(id))nodes.set(id,{
   id,classList:{toggle(){}},style:{},textContent:'',value:'',
   addEventListener(){},focus(){},select(){},setSelectionRange(){},
   closest(){return null},getBoundingClientRect(){return {left:30,top:250}},
  });
  return nodes.get(id);
 }
 const shadow={innerHTML:'',getElementById:el};
 let mounted=0,removed=0;
 const root={
  attachShadow(){return shadow},
  contains(){return false},
  remove(){removed++},
 };
 const listeners={};
 const document={
  createElement(){return root},
  documentElement:{appendChild(){mounted++}},
  addEventListener(name,fn){listeners[name]=fn},
  removeEventListener(){},
  activeElement:null,
  body:{contains(){return true}},
  querySelector(){return {nodeType:1}},
  createRange(){return {selectNodeContents(){},cloneRange(){return this}}},
 };
 const selection={removeAllRanges(){},addRange(){},toString(){return 'テスト文章'}};
 const window={getSelection(){return selection}};
 runInNewContext(source,{window,document},{timeout:1000});
 assert.equal(typeof window.AsahiPanelInstall,'function');
 window.AsahiPanelInstall();
 assert.equal(mounted,1);
 assert.match(el('msg').textContent,/準備OK/);
 el('all').onclick();
 assert.match(el('msg').textContent,/選択/);
 window.AsahiPanelInstall(); // second invocation closes it
 assert.equal(removed,1);
 window.AsahiPanelInstall();
 assert.equal(mounted,2);
 el('close').onclick();
 assert.equal(removed,2);
});

test('bookmarklet stays within displayed page; no silent transfer or GAS writes',()=>{
 for(const token of ['fetch(','XMLHttpRequest(','sendBeacon(','WebSocket(','script.src='])assert.ok(!source.includes(token),'no background network calls');
 assert.match(html,/Google Apps Script.*表示中の文字だけ/s);
 assert.match(html,/保存・実行・デプロイは行わない/);
});
