import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import pg from 'pg';
import {archiveLink,archiveImage,archiveDate,validateArchiveExhibit} from '../museum-exhibits-core.js';
import handler from '../api-museum-exhibits.js';
const sample={
 kind:'icons',title:'思い出のアイコン',description:'大切な記念',credit:'イラスト制作者',
 occurredOn:'2026-10-27',imageUrl:'/assets/mio-bg-princess.jpg',externalUrl:'',
 rightsConfirmed:true,privacyConfirmed:true
};
const host='emuzii-mio-1st-web-v12.vercel.app',token='U'.repeat(43),device='W'.repeat(43);
const uid='00000000-0000-4000-8000-000000000001',id='aabbccdd-1234-4000-8000-112233445566';
const reply=()=>({code:200,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;return this;}});
const request=(method='GET',body,query={},opts={})=>({method,body,query,headers:{
 host,origin:'https://'+host,'content-type':'application/json',
 cookie:'mio_gallery_session='+token+'; mio_gallery_device='+device,...opts
}});
async function withDB(runQuery,run){
 const envs=['GALLERY_DATABASE_URL','MIO_MUSEUM_ARCHIVE_EDIT_ENABLED','MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED'];
 const before=Object.fromEntries(envs.map(x=>[x,process.env[x]]));
 process.env.GALLERY_DATABASE_URL='postgres://example.invalid/isolated-gallery';
 const m1=mock.method(pg.Pool.prototype,'connect',async()=>({query:runQuery,release(){}}));
 const m2=mock.method(pg.Pool.prototype,'end',async()=>{});
 try{await run();}finally{
  m1.mock.restore();m2.mock.restore();
  for(const e of envs){if(before[e]===undefined)delete process.env[e];else process.env[e]=before[e];}
 }
}
const identity=(sql,args,role='owner')=>{
 if(!sql.includes('FROM gallery_admin_sessions'))return null;
 assert.equal(args[0],createHash('sha256').update(token).digest('hex'));
 assert.equal(args[1],createHash('sha256').update(device).digest('hex'));
 return {rows:[{id:uid,role}],rowCount:1};
};
test('exhibit metadata requires copyright and screenshot privacy clearance',()=>{
 assert.deepEqual(validateArchiveExhibit(sample),{
 kind:'icons',title:sample.title,description:sample.description,credit:sample.credit,
 occurredOn:sample.occurredOn,imageUrl:sample.imageUrl,externalUrl:''
 });
 for(const field of ['rightsConfirmed','privacyConfirmed']){
  assert.equal(validateArchiveExhibit({...sample,[field]:false}),null);
 }
 assert.equal(validateArchiveExhibit({...sample,kind:'vault'}),null);
 assert.equal(validateArchiveExhibit({...sample,imageUrl:''}),null);
 assert.ok(validateArchiveExhibit({...sample,kind:'events',imageUrl:'',description:'記念イベント'}));
});
test('URLs and calendar dates reject unsafe or invalid content',()=>{
 for(const image of ['http://site.test/p.jpg','https://evil.test/p.jpg','javascript:alert(1)',
  '/assets/../secret.jpg','/assets/private.svg','data:image/png;base64,AAA']){
  assert.equal(archiveImage(image),null,image);
 }
 assert.equal(archiveImage('/assets/example.webp'),'/assets/example.webp');
 assert.equal(archiveImage('https://abc.public.blob.vercel-storage.com/a.webp'),
  'https://abc.public.blob.vercel-storage.com/a.webp');
 for(const link of ['javascript:alert(1)','http://example.com','/private']){
  assert.equal(archiveLink(link),null,link);
 }
 assert.equal(archiveDate('2026-02-29'),null);
 assert.equal(archiveDate('2024-02-29'),'2024-02-29');
 assert.equal(archiveDate(''),'');
});
test('private/unknown fields are never propagated to public exhibits',()=>{
 const result=validateArchiveExhibit({...sample,participantId:'MIO-0003',deviceToken:'private'});
 assert.equal('participantId' in result,false);
 assert.equal('deviceToken' in result,false);
});
test('archive is closed by default with no database access',async()=>{
 const before=process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED;
 delete process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED;
 try{
  const out=reply();await handler(request('GET'),out);
  assert.equal(out.code,200);assert.deepEqual(out.data,{ok:true,items:[],open:false});
 }finally{if(before===undefined)delete process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED;else process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED=before;}
});
test('published public fetch includes no unpublished or private database fields',async()=>{
 await withDB(async sql=>{
  assert.match(sql,/WHERE status='published'/);
  return {rows:[{kind:'events',title:'周年イベント',description:'開催の記録',credit:'運営',occurred_on:'2026-10-27',
    image_url:'',external_url:'',id,reviewed_by:uid,rights_checked_at:'x',status:'published'}],rowCount:1};
 },async()=>{
  process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED='true';
  const out=reply();await handler(request(),out);
  assert.equal(out.code,200);
  assert.equal(out.data.items[0].occurredOn,'2026-10-27');
  for(const secret of ['id','status','reviewed_by','rights_checked_at'])assert.equal(secret in out.data.items[0],false);
 });
});
test('unauthenticated and non-owner admin requests cannot access unpublished archives',async()=>{
 await withDB(async sql=>{
  if(sql.includes('FROM gallery_admin_sessions'))return {rows:[],rowCount:0};
  throw Error('must not query private archive');
 },async()=>{
  const out=reply();await handler(request('GET',undefined,{scope:'admin'}),out);
  assert.equal(out.code,401);
 });
 await withDB(async(sql,args)=>{
  const q=identity(sql,args,'admin');if(q)return q;
  throw Error('non-owner cannot query private archives');
 },async()=>{
  const out=reply();await handler(request('GET',undefined,{scope:'admin'}),out);
  assert.equal(out.code,403);assert.equal(out.data.code,'MUSEUM_OWNER_ONLY');
 });
});
test('admin writes require same-origin, owner and enable switch',async()=>{
 const wrong=request('POST',{action:'create',item:sample},{},{origin:'https://bad.example'});
 const res=reply();await handler(wrong,res);assert.equal(res.code,403);
 await withDB(async(sql,args)=>{
  const q=identity(sql,args);if(q)return q;
  throw Error('edit disabled must not write');
 },async()=>{
  delete process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED;
  const out=reply();await handler(request('POST',{action:'create',item:sample}),out);
  assert.equal(out.code,503);assert.equal(out.data.code,'ARCHIVE_EDIT_CLOSED');
 });
});
test('new memories are draft-only, with audit and one transaction',async()=>{
 const statements=[];
 await withDB(async(sql,args)=>{
  statements.push(sql);
  const q=identity(sql,args);if(q)return q;
  if(sql.includes('INSERT INTO museum_public_exhibits')){
   assert.match(sql,/VALUES\(\$1,\$2,\$3,\$4,\$5,\$6,\$7,'draft'/);
   assert.equal(args.at(-1),uid);
   return {rows:[{id,status:'draft',revision:0}],rowCount:1};
  }
  return {rows:[],rowCount:1};
 },async()=>{
  process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
  const out=reply();await handler(request('POST',{action:'create',item:sample}),out);
  assert.equal(out.code,200);
  assert.equal(out.data.item.status,'draft');
 });
 assert.ok(statements.includes('BEGIN'));
 assert.ok(statements.includes('COMMIT'));
 assert.ok(statements.some(x=>x.includes('gallery_admin_audit')));
});
test('published item edit sends it back to draft; conflict and audit failure roll back',async()=>{
 const statements=[];
 await withDB(async(sql,args)=>{
  statements.push(sql);
  const a=identity(sql,args);if(a)return a;
  if(sql.includes('UPDATE museum_public_exhibits'))return {rows:[{id,status:'draft',revision:2}],rowCount:1};
  if(sql.includes('gallery_admin_audit'))throw Error('audit unavailable');
  return {rows:[],rowCount:1};
 },async()=>{
  process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
  const out=reply();await handler(request('POST',{action:'update',id,revision:1,item:sample}),out);
  assert.equal(out.code,503);
 });
 assert.ok(statements.some(x=>x.includes("status='draft',revision=revision+1")));
 assert.ok(statements.includes('ROLLBACK'));
 assert.equal(statements.includes('COMMIT'),false);
});
test('publication requires an explicit second privacy/rights review',async()=>{
 await withDB(async(sql,args)=>{
  const a=identity(sql,args);if(a)return a;
  throw Error('No DB writes before publish review');
 },async()=>{
  process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
  const out=reply();await handler(request('POST',{action:'publish',id,revision:0}),out);
  assert.equal(out.code,400);assert.equal(out.data.code,'PUBLISH_REVIEW_REQUIRED');
 });
});
test('stale publication revision is refused without committing',async()=>{
 const statements=[];
 await withDB(async(sql,args)=>{
  statements.push(sql);
  const a=identity(sql,args);if(a)return a;
  if(sql.includes('UPDATE museum_public_exhibits'))return {rows:[],rowCount:0};
  return {rows:[],rowCount:1};
 },async()=>{
  process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
  process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED='true';
  const out=reply();await handler(request('POST',{action:'publish',id,revision:8,rightsConfirmed:true,privacyConfirmed:true}),out);
  assert.equal(out.code,409);
 });
 assert.ok(statements.includes('ROLLBACK'));assert.equal(statements.includes('COMMIT'),false);
 assert.ok(!statements.some(x=>x.includes('gallery_admin_audit')));
});
test('draft editing alone can never mark an exhibit published',async()=>{
 const sqlCalls=[];
 await withDB(async(sql,args)=>{
  sqlCalls.push(sql);
  const a=identity(sql,args);if(a)return a;
  throw Error('Publication may not write without its separate switch');
 },async()=>{
  process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
  delete process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED;
  const out=reply();
  await handler(request('POST',{action:'publish',id,revision:0,rightsConfirmed:true,privacyConfirmed:true}),out);
  assert.equal(out.code,503);
  assert.equal(out.data.code,'ARCHIVE_PUBLISH_CLOSED');
 });
 assert.equal(sqlCalls.some(x=>/^BEGIN|^UPDATE|^INSERT/.test(x)),false);
});
test('owner UI receives a separate publish toggle from the server',async()=>{
 await withDB(async(sql,args)=>{
  const owner=identity(sql,args);if(owner)return owner;
  if(sql.includes('FROM museum_public_exhibits'))return {rows:[],rowCount:0};
  throw Error('Unrelated query attempted');
 },async()=>{
  process.env.MIO_MUSEUM_ARCHIVE_EDIT_ENABLED='true';
  delete process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED;
  const closed=reply();await handler(request('GET',undefined,{scope:'admin'}),closed);
  assert.equal(closed.code,200);
  assert.equal(closed.data.editable,true);
  assert.equal(closed.data.publishEnabled,false);
  process.env.MIO_MUSEUM_ARCHIVE_PUBLISH_ENABLED='true';
  const open=reply();await handler(request('GET',undefined,{scope:'admin'}),open);
  assert.equal(open.code,200);assert.equal(open.data.publishEnabled,true);
 });
});
test('archive pages are linked, responsive and search-safe',()=>{
 const base=new URL('../',import.meta.url);
 const read=name=>readFileSync(new URL(name,base),'utf8');
 const home=read('museum.html'),page=read('museum-archive.html'),
  admin=read('museum-curate.html'),js=read('museum-archive.js'),css=read('museum-archive.css');
 const robots=read('robots.txt');
 const vercel=JSON.parse(read('vercel.json'));
 assert.match(home,/museum-archive\.html\?kind=icons/);
 assert.match(home,/museum-archive\.html\?kind=moments/);
 assert.match(home,/museum-archive\.html\?kind=events/);
 assert.match(page,/noindex,follow/);
 assert.match(admin,/noindex,nofollow/);
 assert.match(robots,/Disallow: \/museum-curate.html/);
 assert.match(admin,/rightsConfirmed/);assert.match(admin,/privacyConfirmed/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
 assert.match(js,/aria-pressed/);
 assert.match(css,/@media\(max-width:630px\)/);
 assert.doesNotThrow(()=>new Script(js));
 assert.ok(vercel.builds.some(x=>x.src==='api-museum-exhibits.js'&&x.use==='@vercel/node'));
 assert.ok(vercel.routes.some(x=>x.src==='/api/museum/exhibits'));
 assert.ok(vercel.builds.some(x=>x.src==='gacha-deluxe-v21.js'),'gacha v2.1 preserved');
});
