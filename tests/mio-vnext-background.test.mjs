import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import pg from 'pg';
import handler from '../api-background.js';

const HOST='emuzii-mio-1st-web-v12.vercel.app';
const token='A'.repeat(43),device='B'.repeat(43);
const hex=x=>createHash('sha256').update(x).digest('hex');
const req=(method='GET',body,opts={})=>({
 method,body,headers:{
  host:HOST,
  origin:'https://'+HOST,
  'content-type':'application/json',
  cookie:'mio_gallery_session='+token+'; mio_gallery_device='+device,
  ...opts
 }
});
const res=()=>({
 code:200,headers:{},data:undefined,
 setHeader(k,v){this.headers[k]=v;},
 status(n){this.code=n;return this;},
 json(x){this.data=x;return this;}
});
async function withDb(query,fn){
 const before=process.env.GALLERY_DATABASE_URL;
 process.env.GALLERY_DATABASE_URL='postgres://example.invalid/test';
 const connect=mock.method(pg.Pool.prototype,'connect',async()=>({query,release(){}}));
 const end=mock.method(pg.Pool.prototype,'end',async()=>{});
 try{await fn();}finally{
  connect.mock.restore();end.mock.restore();
  if(before===undefined)delete process.env.GALLERY_DATABASE_URL;
  else process.env.GALLERY_DATABASE_URL=before;
 }
}
const auth=(sql,args)=>{
 if(sql.startsWith('SELECT u.id FROM gallery_admin_sessions')){
  assert.equal(args[0],hex(token));assert.equal(args[1],hex(device));
  return {rows:[{id:'00000000-0000-4000-8000-000000000001'}],rowCount:1};
 }
 return null;
};
test('missing background table fails closed to princess without creating schema',async()=>{
 const queries=[];
 await withDb(async sql=>{
  queries.push(sql);
  const e=new Error('table missing');e.code='42P01';throw e;
 },async()=>{
  const r=res();await handler(req('GET'),r);
  assert.equal(r.code,200);
  assert.deepEqual(r.data,{ok:true,theme:'princess',revision:0,configured:false});
 });
 assert.deepEqual(queries,['SELECT theme,revision FROM anniversary_background_settings WHERE id=1']);
});
test('empty provisioned background table is available at revision zero',async()=>{
 await withDb(async sql=>{
  assert.match(sql,/^SELECT theme,revision/);
  return {rows:[],rowCount:0};
 },async()=>{
  const r=res();await handler(req('GET'),r);
  assert.deepEqual(r.data,{ok:true,theme:'princess',revision:0,configured:true});
 });
});
test('saved theme is returned with validated integer revision',async()=>{
 await withDb(async()=>({rows:[{theme:'devil',revision:3}],rowCount:1}),async()=>{
  const r=res();await handler(req('GET'),r);
  assert.deepEqual(r.data,{ok:true,theme:'devil',revision:3,configured:true});
 });
});
test('invalid saved theme refuses to represent an unsafe state as success',async()=>{
 await withDb(async()=>({rows:[{theme:'unexpected',revision:3}],rowCount:1}),async()=>{
  const r=res();await handler(req('GET'),r);
  assert.equal(r.code,503);
  assert.equal(r.data.code,'INVALID_SAVED_BACKGROUND');
 });
});
test('method, origin and request fields are rejected before database access',async()=>{
 const invalid=[
  req('PATCH'),req('POST',{theme:'devil',revision:0},{origin:'https://evil.test'}),
  req('POST',{theme:'unknown',revision:0}),
  req('POST',{theme:'devil',revision:-1})
 ];
 for(const input of invalid){
  const r=res();await handler(input,r);
  assert.ok(r.code>=400);assert.equal(r.data.ok,false);
 }
});
test('authorized update writes revision and audit in one transaction',async()=>{
 const queries=[];
 await withDb(async (sql,args)=>{
  queries.push(sql);
  const a=auth(sql,args);if(a)return a;
  if(sql.startsWith('UPDATE anniversary_background_settings')){
   assert.deepEqual(args,['devil','00000000-0000-4000-8000-000000000001',2]);
   return {rowCount:1,rows:[{theme:'devil',revision:3}]};
  }
  return {rowCount:1,rows:[]};
 },async()=>{
  const r=res();await handler(req('POST',{theme:'devil',revision:2}),r);
  assert.equal(r.code,200);
  assert.deepEqual(r.data,{ok:true,theme:'devil',revision:3});
 });
 assert.equal(queries.filter(s=>s==='BEGIN').length,1);
 assert.equal(queries.filter(s=>s==='COMMIT').length,1);
 assert.equal(queries.filter(s=>s.includes('gallery_admin_audit')).length,1);
 assert.equal(queries.some(s=>/CREATE TABLE/i.test(s)),false);
});
test('stale revision responds conflict and rolls back without audit',async()=>{
 const queries=[];
 await withDb(async(sql,args)=>{
  queries.push(sql);
  const a=auth(sql,args);if(a)return a;
  if(sql.startsWith('UPDATE anniversary_background_settings'))return {rowCount:0,rows:[]};
  return {rowCount:0,rows:[]};
 },async()=>{
  const r=res();await handler(req('POST',{theme:'princess',revision:9}),r);
  assert.equal(r.code,409);assert.equal(r.data.code,'SETTING_CHANGED_RELOAD');
 });
 assert.ok(queries.includes('ROLLBACK'));
 assert.equal(queries.some(q=>q.includes('gallery_admin_audit')),false);
 assert.equal(queries.includes('COMMIT'),false);
});
test('failed audit rolls back background setting transaction',async()=>{
 const queries=[];
 await withDb(async(sql,args)=>{
  queries.push(sql);
  const a=auth(sql,args);if(a)return a;
  if(sql.startsWith('UPDATE anniversary_background_settings'))return {rowCount:1,rows:[{theme:'devil',revision:2}]};
  if(sql.includes('gallery_admin_audit'))throw new Error('audit unavailable');
  return {rowCount:1,rows:[]};
 },async()=>{
  const r=res();await handler(req('POST',{theme:'devil',revision:1}),r);
  assert.equal(r.code,503);assert.equal(r.data.ok,false);
 });
 assert.ok(queries.includes('ROLLBACK'));assert.equal(queries.includes('COMMIT'),false);
});
test('unverified device never reaches write transaction',async()=>{
 const queries=[];
 await withDb(async(sql)=>{queries.push(sql);return {rows:[],rowCount:0};},async()=>{
  const r=res();await handler(req('POST',{theme:'devil',revision:1}),r);
  assert.equal(r.code,401);assert.equal(r.data.code,'ADMIN_LOGIN_REQUIRED');
 });
 assert.equal(queries.some(x=>x==='BEGIN'),false);
});
test('UI blocks saves until schema is ready and swaps real images',()=>{
 const page=readFileSync(new URL('../admin-hub.html',import.meta.url),'utf8');
 const api=readFileSync(new URL('../api-background.js',import.meta.url),'utf8');
 const theme=readFileSync(new URL('../background-theme.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../background-theme.css',import.meta.url),'utf8');
 const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(api,/CREATE TABLE/i);
 assert.match(page,/d.configured!==true/);
 assert.match(page,/id="backgroundSave" type="button" disabled/);
 assert.match(page,/revision=null; \/\/ Never repeat/);
 assert.ok(vercel.builds.some(x=>x.src==='background-theme.js'));
 assert.ok(vercel.routes.some(x=>x.src==='/api/background'));
 assert.doesNotMatch(css,/visibility:hidden/);
 assert.match(theme,/img.setAttribute\('src',imagePath\)/);
 assert.match(theme,/banner.setAttribute\('aria-label'/);
 for(const script of page.split('<script>').slice(1).map(x=>x.split('</script>')[0]))
  assert.doesNotThrow(()=>new vm.Script(script));
 assert.doesNotThrow(()=>new vm.Script(theme));
});
