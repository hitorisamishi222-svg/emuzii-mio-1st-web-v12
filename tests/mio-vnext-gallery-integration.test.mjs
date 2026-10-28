import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import pg from 'pg';
import submissions from '../api-gallery-submissions.js';
import gallery from '../api-gallery-items.js';

const HOST='emuzii-mio-1st-web-v12.vercel.app';
const token='T'.repeat(43),device='V'.repeat(43);
const user='00000000-0000-4000-8000-000000000001';
const digest=s=>createHash('sha256').update(s).digest('hex');
const response=()=>({statusCode:200,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(o){this.data=o;return this;}});
const request=(method='GET',body,query={})=>({method,body,query,headers:{
 host:HOST,origin:'https://'+HOST,'content-type':'application/json',
 cookie:'mio_gallery_session='+token+'; mio_gallery_device='+device,
 'x-vercel-forwarded-for':'192.0.2.50'
}});
async function fakeDB(query,run){
 const envs=['GALLERY_DATABASE_URL','MIO_GALLERY_SUBMISSIONS_ENABLED','GALLERY_SUBMISSION_RATE_SECRET','MIO_GALLERY_SUBMISSIONS_PUBLISH_ENABLED'];
 const prior=Object.fromEntries(envs.map(k=>[k,process.env[k]]));
 process.env.GALLERY_DATABASE_URL='postgres://example.invalid/test';
 const connection=mock.method(pg.Pool.prototype,'connect',async()=>({query,release(){}}));
 const direct=mock.method(pg.Pool.prototype,'query',query);
 const end=mock.method(pg.Pool.prototype,'end',async()=>{});
 try{await run();}finally{
  connection.mock.restore();direct.mock.restore();end.mock.restore();
  for(const k of envs){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
 }
}
function auth(sql,args){
 if(!sql.includes('FROM gallery_admin_sessions'))return null;
 assert.equal(args[0],digest(token));assert.equal(args[1],digest(device));
 return {rows:[{id:user}],rowCount:1};
}
const sample={action:'apply',title:'翠央への応援',creator:'投稿者',description:'作品紹介',
 category:'ファンアート',url:'https://example.org/fanart1',consent:true,website:''};
const uuid='aabbccdd-1234-4000-8000-112233445566';

test('closed public intake returns unavailable without connecting to database',async()=>{
 const before=process.env.MIO_GALLERY_SUBMISSIONS_ENABLED;
 delete process.env.MIO_GALLERY_SUBMISSIONS_ENABLED;
 try{const out=response();await submissions(request(),out);
  assert.deepEqual(out.data,{ok:true,open:false});assert.equal(out.statusCode,200);
 }finally{if(before===undefined)delete process.env.MIO_GALLERY_SUBMISSIONS_ENABLED;else process.env.MIO_GALLERY_SUBMISSIONS_ENABLED=before;}
});
test('admin review endpoint refuses missing session without any record reads',async()=>{
 const calls=[];
 await fakeDB(async sql=>{calls.push(sql);throw Error('database read must not happen');},async()=>{
  const r=request('GET',undefined,{scope:'admin'});r.headers.cookie='';
  const out=response();await submissions(r,out);
  assert.equal(out.statusCode,401);assert.equal(out.data.code,'ADMIN_LOGIN_REQUIRED');
 });
 assert.deepEqual(calls,[]);
});
test('public submission is stored pending only when opt-in is enabled',async()=>{
 const statements=[];
 await fakeDB(async (sql,args)=>{
  statements.push(sql);
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[],rowCount:1};
  if(sql.includes('count(*)::int'))return {rows:[{count:0}],rowCount:1};
  if(sql.includes('lower(external_url)'))return {rows:[],rowCount:0};
  return {rows:[],rowCount:1};
 },async()=>{
  process.env.MIO_GALLERY_SUBMISSIONS_ENABLED='true';
  process.env.GALLERY_SUBMISSION_RATE_SECRET='x'.repeat(40);
  const out=response();await submissions(request('POST',sample),out);
  assert.equal(out.statusCode,201);
  assert.deepEqual(out.data,{ok:true,received:true,message:'応募を受け付けました。掲載には運営の確認が必要です。'});
 });
 assert.ok(statements.some(s=>s.includes('INSERT INTO gallery_submissions')));
 assert.ok(statements.includes('BEGIN'));assert.ok(statements.includes('COMMIT'));
 assert.equal(statements.some(s=>s.includes('UPDATE gallery_live_overrides')),false);
});
test('administrative media create keeps work pending and commits audit',async()=>{
 const statements=[];
 await fakeDB(async(sql,args)=>{
  statements.push(sql);
  const a=auth(sql,args);if(a)return a;
  if(sql.includes('INSERT INTO gallery_submissions'))return {rows:[{id:uuid,status:'pending',revision:0}],rowCount:1};
  if(sql.includes('gallery_admin_audit'))assert.deepEqual(args,[user,'media_create',uuid]);
  return {rows:[],rowCount:1};
 },async()=>{
  delete process.env.MIO_GALLERY_SUBMISSIONS_ENABLED;
  const out=response();
  await submissions(request('POST',{action:'mediaCreate',item:{
   title:'記念映像',creator:'投稿者',description:'',category:'動画',
   url:'https://example.org/new-video',thumbnail:'',consent:true
  }}),out);
  assert.equal(out.statusCode,200);assert.equal(out.data.item.status,'pending');
 });
 assert.ok(statements.includes('COMMIT'));
 assert.ok(statements.some(s=>s.includes('gallery_admin_audit')));
});
test('review approval is authenticated, revisioned and audited atomically',async()=>{
 const statements=[];
 await fakeDB(async(sql,args)=>{
  statements.push(sql);
  const a=auth(sql,args);if(a)return a;
  if(sql.startsWith('UPDATE gallery_submissions')){
   assert.deepEqual(args,['approved',user,uuid,0,'pending']);
   return {rows:[{id:uuid,status:'approved',revision:1}],rowCount:1};
  }
  return {rows:[],rowCount:1};
 },async()=>{
  const out=response();await submissions(request('POST',{action:'approve',id:uuid,revision:0}),out);
  assert.equal(out.statusCode,200);assert.equal(out.data.item.status,'approved');
 });
 assert.ok(statements.includes('BEGIN'));assert.ok(statements.includes('COMMIT'));
 assert.ok(statements.some(s=>s.includes('gallery_admin_audit')));
});
test('stale review revision rejects without audit or commit',async()=>{
 const calls=[];
 await fakeDB(async(sql,args)=>{
  calls.push(sql);
  const a=auth(sql,args);if(a)return a;
  if(sql.startsWith('UPDATE gallery_submissions'))return {rows:[],rowCount:0};
  return {rows:[],rowCount:1};
 },async()=>{
  const out=response();await submissions(request('POST',{action:'approve',id:uuid,revision:2}),out);
  assert.equal(out.statusCode,409);assert.equal(out.data.code,'SUBMISSION_CHANGED_OR_ACTION_INVALID');
 });
 assert.ok(calls.includes('ROLLBACK'));
 assert.ok(!calls.includes('COMMIT'));assert.ok(!calls.some(s=>s.includes('gallery_admin_audit')));
});
test('audit failure rolls back review so it cannot become publicly approved',async()=>{
 const calls=[];
 await fakeDB(async(sql,args)=>{
  calls.push(sql);
  const a=auth(sql,args);if(a)return a;
  if(sql.startsWith('UPDATE gallery_submissions'))return {rows:[{id:uuid,status:'approved',revision:1}],rowCount:1};
  if(sql.includes('gallery_admin_audit'))throw Error('audit unavailable');
  return {rows:[],rowCount:1};
 },async()=>{
  const out=response();await submissions(request('POST',{action:'approve',id:uuid,revision:0}),out);
  assert.equal(out.statusCode,503);assert.equal(out.data.code,'SUBMISSION_SERVICE_UNAVAILABLE');
 });
 assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.includes('COMMIT'));
});
test('public catalog contains approved submission only when separately enabled',async()=>{
 const calls=[];
 await fakeDB(async (sql,args)=>{
  calls.push(sql);
  if(sql.includes('FROM gallery_live_overrides'))return {rows:[],rowCount:0};
  if(sql.includes('FROM gallery_submissions')){
   assert.match(sql,/WHERE status='approved'/);
   return {rows:[{id:uuid,title:'承認済み作品',creator:'投稿者',description:'',
    category:'動画',external_url:'https://example.org/approved',thumbnail_url:''}],rowCount:1};
  }
  throw Error('unexpected query');
 },async()=>{
  process.env.MIO_GALLERY_SUBMISSIONS_PUBLISH_ENABLED='true';
  const out=response();await gallery({method:'GET',headers:{}},out);
  assert.equal(out.statusCode,200);assert.ok(out.data.ok);
  assert.equal(out.data.items[0].title,'承認済み作品');
  assert.ok(out.data.items.some(x=>x.id==='mio-awakening-video'));
 });
 assert.ok(calls.some(s=>s.includes('FROM gallery_submissions')));
});
test('optional submission query failure does not hide existing published items',async()=>{
 await fakeDB(async sql=>{
  if(sql.includes('FROM gallery_live_overrides'))return {rows:[],rowCount:0};
  const error=new Error('table missing');error.code='42P01';throw error;
 },async()=>{
  process.env.MIO_GALLERY_SUBMISSIONS_PUBLISH_ENABLED='true';
  const out=response();await gallery({method:'GET',headers:{}},out);
  assert.equal(out.statusCode,200);assert.equal(out.data.ok,true);
  assert.ok(out.data.items.some(x=>x.id==='mio-awakening-video'));
 });
});
