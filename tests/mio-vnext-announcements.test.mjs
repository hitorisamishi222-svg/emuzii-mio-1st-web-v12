import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import pg from 'pg';
import handler from '../api-announcements.js';

const HOST='emuzii-mio-1st-web-v12.vercel.app';
const token='S'.repeat(43),device='D'.repeat(43),uid='00000000-0000-4000-8000-000000000001';
const digest=x=>createHash('sha256').update(x).digest('hex');
const request=(method='GET',body,query={})=>({
 method,body,query,
 headers:{host:HOST,origin:'https://'+HOST,'content-type':'application/json',
 cookie:'mio_gallery_session='+token+'; mio_gallery_device='+device}
});
const response=()=>({
 code:200,data:undefined,headers:{},
 setHeader(k,v){this.headers[k]=v;},
 status(n){this.code=n;return this;},
 json(value){this.data=value;return this;}
});
const notice={id:'42',title:'イベント案内',body:'内容です',published:false,revision:1,updated_at:'2026-10-28T00:00:00Z'};
async function withDatabase(query,run){
 const prev=process.env.GALLERY_DATABASE_URL;
 process.env.GALLERY_DATABASE_URL='postgres://example.invalid/test';
 const conn=mock.method(pg.Pool.prototype,'connect',async()=>({query,release(){}}));
 const end=mock.method(pg.Pool.prototype,'end',async()=>{});
 try{await run();}finally{
  conn.mock.restore();end.mock.restore();
  if(prev===undefined)delete process.env.GALLERY_DATABASE_URL;
  else process.env.GALLERY_DATABASE_URL=prev;
 }
}
function authQuery(sql,args){
 if(!sql.includes('FROM gallery_admin_sessions'))return null;
 assert.equal(args[0],digest(token));
 assert.equal(args[1],digest(device));
 return {rows:[{id:uid,role:'admin'}],rowCount:1};
}
test('public announcement GET maps updated_at to updatedAt without audit writes',async()=>{
 const calls=[];
 await withDatabase(async(sql,args)=>{
  calls.push(sql);
  const auth=authQuery(sql,args);if(auth)return auth;
  if(sql.includes('FROM anniversary_announcements')){
   assert.match(sql,/WHERE published=true/);
   return {rows:[{...notice,published:true}],rowCount:1};
  }
  throw Error('unexpected SQL');
 },async()=>{
  const out=response();await handler(request(),out);
  assert.equal(out.code,200);
  assert.equal(out.data.items[0].updatedAt,notice.updated_at);
  assert.equal(out.data.items[0].id,'42');
  assert.equal(out.data.items[0].published,true);
 });
 assert.ok(!calls.some(sql=>/BEGIN|INSERT INTO gallery_admin_audit/.test(sql)));
});
test('new announcement and matching audit record are one atomic operation',async()=>{
 const calls=[];
 await withDatabase(async(sql,args)=>{
  calls.push(sql);
  const auth=authQuery(sql,args);if(auth)return auth;
  if(sql.startsWith('INSERT INTO anniversary_announcements')){
   assert.deepEqual(args,['イベント案内','内容です',uid]);
   return {rows:[notice],rowCount:1};
  }
  if(sql.includes('INSERT INTO gallery_admin_audit')){
   assert.deepEqual(args,[uid,'announcement_create','42']);
  }
  return {rows:[],rowCount:1};
 },async()=>{
  const out=response();await handler(request('POST',{action:'create',title:'イベント案内',body:'内容です'}),out);
  assert.equal(out.code,200);
  assert.equal(out.data.item.updatedAt,notice.updated_at);
 });
 assert.ok(calls.indexOf('BEGIN')<calls.findIndex(sql=>sql.includes('INSERT INTO anniversary_announcements')));
 assert.ok(calls.findIndex(sql=>sql.includes('gallery_admin_audit'))<calls.indexOf('COMMIT'));
 assert.equal(calls.includes('ROLLBACK'),false);
});
test('stale revision rejects update and rolls back without audit',async()=>{
 const calls=[];
 await withDatabase(async(sql,args)=>{
  calls.push(sql);
  const auth=authQuery(sql,args);if(auth)return auth;
  if(sql.startsWith('UPDATE anniversary_announcements'))return {rows:[],rowCount:0};
  return {rows:[],rowCount:1};
 },async()=>{
  const out=response();await handler(request('POST',{action:'update',id:'42',revision:8,title:'イベント案内',body:'内容です'}),out);
  assert.equal(out.code,409);
  assert.equal(out.data.code,'ITEM_CHANGED_RELOAD');
 });
 assert.ok(calls.includes('ROLLBACK'));
 assert.equal(calls.includes('COMMIT'),false);
 assert.ok(!calls.some(sql=>sql.includes('gallery_admin_audit')));
});
test('failed audit prevents announcement publication from committing',async()=>{
 const calls=[];
 await withDatabase(async(sql,args)=>{
  calls.push(sql);
  const auth=authQuery(sql,args);if(auth)return auth;
  if(sql.startsWith('UPDATE anniversary_announcements'))return {rows:[{...notice,revision:2,published:true}],rowCount:1};
  if(sql.includes('INSERT INTO gallery_admin_audit'))throw new Error('audit unavailable');
  return {rows:[],rowCount:1};
 },async()=>{
  const out=response();await handler(request('POST',{action:'publish',id:'42',revision:1}),out);
  assert.equal(out.code,503);
  assert.equal(out.data.code,'ANNOUNCEMENTS_UNAVAILABLE');
 });
 assert.ok(calls.includes('ROLLBACK'));
 assert.equal(calls.includes('COMMIT'),false);
});
test('guest or unapproved-device session cannot modify announcements',async()=>{
 const calls=[];
 await withDatabase(async(sql,args)=>{
  calls.push(sql);
  if(sql.includes('FROM gallery_admin_sessions'))return {rows:[],rowCount:0};
  throw Error('unexpected write');
 },async()=>{
  const out=response();await handler(request('POST',{action:'delete',id:'42',revision:1}),out);
  assert.equal(out.code,401);
  assert.equal(out.data.code,'ADMIN_LOGIN_REQUIRED');
 });
 assert.ok(!calls.includes('BEGIN'));
});
test('oversize JSON payload is refused without database access',async()=>{
 const out=response();
 await handler(request('POST',{action:'create',title:'x',body:'Z'.repeat(15000)}),out);
 assert.equal(out.code,413);
 assert.equal(out.data.code,'REQUEST_TOO_LARGE');
});
