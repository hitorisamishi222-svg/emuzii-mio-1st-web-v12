import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('museum-curate.html');
const workflow=read('.github/workflows/mio-museum-phase2.yml');
const open=html.indexOf('<script>'),close=html.indexOf('</script>',open);
const js=html.slice(open+8,close);

test('owner curation offers three easy steps with clearly labeled fields',()=>{
 assert.match(html,/かんたん3ステップ/);
 assert.match(html,/何の思い出？/);
 assert.match(html,/写真と思い出の内容/);
 assert.match(html,/公開しても大丈夫か確認/);
 for(const id of ['kind','title','occurredOn','description','uploadImage',
  'rightsConfirmed','privacyConfirmed','save','publish','hide','newExhibit']){
  assert.match(html,new RegExp('id="'+id+'"'),'missing control '+id);
 }
 assert.match(html,/写真の選択を取り消す/);
 assert.match(html,/下書きとして保存/);
});
test('advanced, deletion and asset diagnostics default to closed native details',()=>{
 for(const id of ['optionalFields','extraLinks','dangerActions','assetAuditPanel']){
  assert.match(html,new RegExp('<details[^>]*id="'+id+'"'));
  const tag=html.match(new RegExp('<details[^>]*id="'+id+'"[^>]*>'))?.[0]||'';
  assert.doesNotMatch(tag,/\sopen(?:\s|>)/i,id+' should be closed by default');
 }
 assert.match(html,/ゴミ箱から復元/);
 assert.match(html,/永久削除することはできません/);
 assert.match(html,/入力中の内容はまだ保存されていません/);
});
test('mobile layout prevents tiny text inputs and hard-to-tap controls',()=>{
 assert.match(html,/<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/);
 assert.match(html,/input,textarea,select\{font-size:16px/);
 assert.match(html,/button\{[^}]*min-height:48px/);
 assert.match(html,/@media\(max-width:600px\)/);
 assert.match(html,/\.action-bar\{position:sticky;bottom:0/);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
});
test('markup has unique IDs and each editable input has a matching label',()=>{
 const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(ids.length,new Set(ids).size,'duplicate HTML IDs are unsafe');
 const idSet=new Set(ids);
 for(const label of html.matchAll(/<label[^>]*\sfor="([^"]+)"/g))
  assert.ok(idSet.has(label[1]),'label points to missing input: '+label[1]);
 assert.equal((html.match(/<details\b/g)||[]).length,(html.match(/<\/details>/g)||[]).length);
});
test('inline controller is valid JavaScript, with no HTML string injection',()=>{
 assert.ok(open>0&&close>open);
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'museum-curate-inline.js'}));
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(js,/\.textContent=/);
 assert.match(js,/formDirty/);
 assert.match(js,/contentDirty/);
 assert.match(js,/if\(selected\?\.status==='trash'/);
});
test('image preview only accepts whitelisted public URLs',()=>{
 const a=js.indexOf('// Only preview whitelisted');
 const b=js.indexOf('function renderSummary()',a);
 assert.ok(a>0&&b>a);
 const scope={URL};
 const fn=vm.runInNewContext(js.slice(a,b)+'\npreviewAllowed;',scope);
 assert.equal(fn('/assets/mio-bg-princess.jpg'),true);
 assert.equal(fn('https://abc.public.blob.vercel-storage.com/mio-museum/a.webp'),true);
 for(const bad of ['javascript:alert(1)','data:image/png,aaa','https://example.org/face.jpg',
  'http://abc.public.blob.vercel-storage.com/a.webp','/assets/../private.jpg',
  'https://user:secret@abc.public.blob.vercel-storage.com/a.webp']){
   assert.equal(fn(bad),false,bad);
 }
});
test('status counters and filters retain selected exhibit without deleting its edits',()=>{
 const a=js.indexOf('function renderSummary()');
 const b=js.indexOf('function buttons(){',a);
 assert.ok(a>0&&b>a);
 const nodes={exhibitSearch:{value:'翠央',addEventListener(){}},
  exhibitFilter:{value:'published',addEventListener(){}},
  exhibitSummary:{children:[],replaceChildren(){this.children=[];},append(x){this.children.push(x);}},
  selectExhibit:{children:[],value:'',replaceChildren(){this.children=[];},append(x){this.children.push(x);}}};
 const items=[
  {id:'A',title:'翠央の思い出',status:'draft'},
  {id:'B',title:'翠央アイコン',status:'published'},
  {id:'C',title:'イベント',status:'trash'}
 ];
 const newNode=()=>({value:'',textContent:''});
 const state={
  URL,document:{createElement:newNode},$:id=>nodes[id],items,
  selected:items[0],
  titleStatus:{draft:'下書き',published:'公開中',hidden:'非公開',trash:'ゴミ箱'}
 };
 const fn=vm.runInNewContext(js.slice(a,b)+'\nfilterList;',state);
 fn();
 assert.equal(nodes.selectExhibit.value,'A'); // unsaved draft remains selected
 assert.equal(nodes.selectExhibit.children.length,3); // blank, selected and matching published
 assert.ok(nodes.exhibitSummary.children.some(x=>x.textContent==='ゴミ箱 1件'));
 nodes.exhibitFilter.value='trash';nodes.exhibitSearch.value='';
 fn('C');
 assert.equal(nodes.selectExhibit.value,'C');
 assert.ok(nodes.selectExhibit.children.some(x=>x.textContent.includes('イベント')));
});
test('changing content cannot silently publish edits that were never saved',()=>{
 assert.match(js,/if\(action==='publish'&&contentDirty\)/);
 assert.match(js,/入力内容に未保存の変更があります/);
 assert.match(js,/rightsConfirmed','privacyConfirmed/);
 assert.match(js,/if\(imageRequestStarted\)saveNeedsReview=true/);
 assert.match(js,/saveNeedsReview=false/);
 assert.match(js,/selected\?\.status==='trash'/);
});
