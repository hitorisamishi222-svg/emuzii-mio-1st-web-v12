import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const page=readFileSync(new URL('../gacha-admin-preview.html',import.meta.url),'utf8');
const live=readFileSync(new URL('../gacha-web-gate.html',import.meta.url),'utf8');
const js=page.split('<script>')[1]?.split('</script>')[0];

test('demo is visibly labelled as fake data and cannot be mistaken for live admin',()=>{
 assert.match(page,/<title>みお｜運営管理センター・接続前プレビュー<\/title>/);
 assert.match(page,/架空データのみ・本番データは読み取りません/);
 assert.match(page,/承認や回数付与は一切実行できません/);
 assert.match(page,/管理書込/);
 assert.match(page,/本番の承認・回数付与/);
});
test('demo contains no requests, keys, sensitive real registration IDs or storage',()=>{
 for(const bad of [
  'fetch(', 'XMLHttpRequest', 'navigator.sendBeacon', 'localStorage', 'sessionStorage',
  'APPS_SCRIPT_SECRET', 'APPS_SCRIPT_URL', 'MIO_GACHA_WEB_KEY',
  'MIO-W-', '/api/gacha-admin-ops', 'WebAuthn', 'navigator.credentials'
 ])assert.equal(page.includes(bad),false,'demo must not contain '+bad);
 assert.match(page,/Content-Security-Policy/);
 assert.match(page,/default-src 'none'/);
 assert.match(page,/form-action 'none'/);
});
test('buttons that could imply real approval/entitlement changes are all disabled',()=>{
 const buttonTags=page.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)||[];
 const actions=buttonTags.filter(s=>/承認（未接続）|確認を確定（未接続）|回数付与を確定（未接続）/.test(s));
 assert.ok(actions.length>=4);
 assert.ok(actions.every(t=>/<button\b[^>]*\bdisabled\b/.test(t)));
});
test('demo exposes 4 reachable panels, readable on phone',()=>{
 for(const id of ['approve','member','grant','status']){
  assert.match(page,new RegExp('data-tab="'+id+'"'));
  assert.match(page,new RegExp('id="'+id+'" role="tabpanel"'));
 }
 assert.match(page,/grid-template-columns:1fr/);
 assert.match(page,/name="viewport" content="width=device-width,initial-scale=1"/);
});
test('actual preview page displays warning, links to demo, and retains original lock',()=>{
 assert.match(live,/id="opsPreviewNotice" hidden/);
 assert.match(live,/href="\/gacha-admin-preview\.html"/);
 assert.match(live,/location\.hostname!=='emuzii-mio-1st-web-v12\.vercel\.app'/);
 assert.match(live,/src="\/gacha-admin-ops\.js"/);
 assert.match(live,/src="\/gacha-passkey-ui\.js"/);
});
test('demo tab navigation and sample name filter run without network',()=>{
 const events={};const panels={},tabs=[];
 for(const id of ['approve','member','grant','status']){
  panels[id]={hidden:id!=='approve'};
  const t={dataset:{tab:id},selected:false,addEventListener(type,fn){events['tab_'+id+'_'+type]=fn},
   setAttribute(n,v){if(n==='aria-selected')this.selected=v}};
  tabs.push(t);
 }
 const cards=['みなと','あお','ひかり'].map(n=>({dataset:{name:n},hidden:false}));
 const search={addEventListener(type,fn){events['search_'+type]=fn}};
 const document={
  querySelectorAll(sel){if(sel==='[data-tab]')return tabs;if(sel==='#roster [data-name]')return cards;throw Error(sel)},
  getElementById(id){if(id==='search')return search;return panels[id]||null}
 };
 assert.ok(js&&js.includes('addEventListener'));
 vm.runInNewContext(js,{document});
 assert.ok(typeof events.tab_member_click==='function');
 events.tab_member_click();
 assert.equal(panels.member.hidden,false);
 assert.equal(panels.approve.hidden,true);
 assert.equal(tabs[1].selected,'true');
 events.search_input({target:{value:'あお'}});
 assert.deepEqual(cards.map(c=>c.hidden),[true,false,true]);
});
