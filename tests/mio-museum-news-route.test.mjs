import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const src=read('museum-news.js');
const config=JSON.parse(read('vercel.json'));
const callPath='/api/gallery/announcements';

function checkStub({items=[],status=200,ok=true}={}){
 const calls=[];
 const node=(tag)=>({tag,children:[],textContent:'',href:'',className:'',
  dateTime:'',attributes:{},
  append(...els){this.children.push(...els)},
  setAttribute(key,value){this.attributes[key]=value},
  replaceChildren(...els){this.children.splice(0,this.children.length,...els)}
 });
 const root=node('section');
 const document={getElementById(id){return id==='museumNews'?root:null},createElement:node};
 const fetch=async(path,options)=>{
  calls.push({path,options});
  return {ok:status>=200&&status<300,json:async()=>({ok,items})};
 };
 vm.runInNewContext(src,{document,fetch});
 return {root,calls,children:root.children};
}
async function flush(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve))}

test('museum news uses the existing Vercel public announcement route, without gallery credentials',async()=>{
 const h=checkStub();
 await flush();
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].path,callPath);
 assert.equal(h.calls[0].options.credentials,'omit');
 assert.equal(h.calls[0].options.cache,'no-store');
 assert.equal(config.routes.filter(x=>x.src===callPath&&x.dest==='/api-announcements.js').length,1);
 assert.ok(config.builds.some(x=>x.src==='api-announcements.js'&&x.use==='@vercel/node'));
});
test('museum displays only published notices and never raw HTML or admin data',async()=>{
 const h=checkStub({items:[
  {published:false,title:'非公開の告知',body:'絶対に表示しない'},
  {published:true,title:'<script>題名</script>',body:'<b>記念館のお知らせ</b>',updatedAt:'2026-10-29T12:00:00.000Z'},
  {published:true,title:'公開済みの記録',body:'確認済み'}
 ]});
 await flush();
 assert.equal(h.children.length,2);
 assert.equal(h.children[0].children[1].textContent,'<script>題名</script>');
 assert.equal(h.children[0].children[2].textContent,'<b>記念館のお知らせ</b>');
 assert.equal(h.children[1].children[1].textContent,'公開済みの記録');
 assert.ok(!JSON.stringify(h.children).includes('非公開の告知'));
 assert.equal(h.root.attributes['aria-busy'],'false');
 assert.doesNotMatch(src,/\.innerHTML\s*=/);
 assert.doesNotMatch(src,/scope=admin|credentials:\s*['"]include['"]/);
});
test('network or empty public response fails closed to announcements link',async()=>{
 for(const input of [{status:503},{items:[]},{ok:false,items:[{published:true,title:'x',body:'y'}]}]){
  const h=checkStub(input);
  await flush();
  assert.equal(h.children.length,1);
  assert.equal(h.children[0].children.at(-1).href,'/announcements.html');
  assert.equal(h.root.attributes['aria-busy'],'false');
 }
});
test('museum renders at most three public notices even if endpoint returns more',async()=>{
 const items=Array.from({length:9},(_,i)=>({published:true,title:'お知らせ '+i,body:'公開済み'}));
 const h=checkStub({items});await flush();
 assert.equal(h.children.length,3);
});
