// Node-only regression for the isolated NEXT admin preview. No browser, API, or storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../next-pages.js',import.meta.url),'utf8');
const markup=readFileSync(new URL('../admin-center-demo.html',import.meta.url),'utf8');
function createAdmin(){
 const nodes=new Map();
 function make(){
  return {textContent:'',value:'',className:'',children:[],attributes:{},events:{},
   addEventListener(name,handler){this.events[name]=handler;},
   append(...elements){this.children.push(...elements);},
   replaceChildren(...elements){this.children=[...elements];this.textContent='';},
   setAttribute(name,value){this.attributes[name]=value;},
   click(){this.events.click?.();}
  };
 }
 const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id)};
 const document={body:{dataset:{page:'admin'}},getElementById:get,createElement:()=>make()};
 vm.runInNewContext(code,{document,Date,Intl,URL,Set,console},{timeout:1000});
 return {get};
}
test('admin page contains editable notices and streaming schedule controls',()=>{
 for(const id of ['newsTitle','newsBody','newsLevel','newsLink','previewNotice','noticePreview','scheduleTitle','scheduleStart','scheduleEnd','scheduleLink','previewSchedule','schedulePreview']){
  assert(markup.includes('id="'+id+'"'),id);
 }
 assert(markup.includes('NEXT TEST ONLY'));
});
test('valid notice only renders a text-only local preview',()=>{
 const {get}=createAdmin();
 get('newsTitle').value='<script>preview</script>';
 get('newsBody').value='テストのお知らせ';
 get('newsLevel').value='重要';
 get('newsLink').value='https://example.com/news';
 get('previewNotice').click();
 const root=get('noticePreview');
 assert.equal(root.children[0].textContent,'<script>preview</script>');
 assert.equal(root.children[2].textContent,'［重要］プレビューのみ・未公開');
 assert.equal(root.children[3].href,'https://example.com/news');
});
test('unsafe URLs and empty required fields are rejected',()=>{
 const {get}=createAdmin();
 get('newsTitle').value='ニュース';
 get('newsBody').value='詳細';
 get('newsLevel').value='通常';
 for(const bad of ['http://example.com','javascript:alert(1)','https://user:pass@example.com']){
  get('newsLink').value=bad;
  get('previewNotice').click();
  assert.match(get('noticePreview').textContent,/URL/);
 }
 get('newsLink').value='';
 get('newsTitle').value='';
 get('previewNotice').click();
 assert.match(get('noticePreview').textContent,/タイトル/);
});
test('schedule needs valid Japanese local times and end later than start',()=>{
 const {get}=createAdmin();
 get('scheduleTitle').value='LIVE test';
 get('scheduleStart').value='2026-10-10T18:00';
 get('scheduleEnd').value='2026-10-10T17:00';
 get('previewSchedule').click();
 assert.match(get('schedulePreview').textContent,/終了/);
 get('scheduleStart').value='2026-02-30T18:00';
 get('scheduleEnd').value='2026-03-01T20:00';
 get('previewSchedule').click();
 assert.match(get('schedulePreview').textContent,/正しく入力/);
 const local=minutes=>new Date(Date.now()+minutes*60000+9*3600000).toISOString().slice(0,16);
 get('scheduleStart').value=local(120);
 get('scheduleEnd').value=local(200);
 get('scheduleLink').value='https://example.com/live';
 get('previewSchedule').click();
 const children=get('schedulePreview').children;
 assert.equal(children[0].textContent,'LIVE test');
 assert.match(children[2].textContent,/NEXT LIVE/);
 assert.equal(children[3].href,'https://example.com/live');
});
test('next admin preview has no direct production fetch or storage in code',()=>{
 assert(!/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(code));
});
