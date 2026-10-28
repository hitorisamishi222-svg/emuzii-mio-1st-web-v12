import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {secureMediaThumbnail,validateMediaAdminItem,reviewTransition} from '../gallery-submissions-core.js';

const base={
 title:'記念動画',creator:'翠央っ子',description:'お祝い作品',
 category:'動画',url:'https://example.com/watch?v=123',thumbnail:'/assets/gallery-cover.webp',consent:true
};
test('media metadata is restricted to music/video and explicit rights approval',()=>{
 assert.deepEqual(validateMediaAdminItem(base),{
  title:'記念動画',creator:'翠央っ子',description:'お祝い作品',category:'動画',
  url:'https://example.com/watch?v=123',thumbnail:'/assets/gallery-cover.webp'
 });
 assert.equal(validateMediaAdminItem({...base,category:'ファンアート'}),null);
 assert.equal(validateMediaAdminItem({...base,consent:false}),null);
});
test('only owned static or blob thumbnails are accepted',()=>{
 assert.equal(secureMediaThumbnail(''),'');
 assert.equal(secureMediaThumbnail('/assets/cover.webp'),'/assets/cover.webp');
 assert.equal(secureMediaThumbnail('/assets/../../secret.png'),null);
 assert.equal(secureMediaThumbnail('https://evil.example.com/image.jpg'),null);
 assert.equal(secureMediaThumbnail('javascript:alert(1)'),null);
 assert.equal(secureMediaThumbnail('https://example.com/image.jpg'),null);
 assert.equal(secureMediaThumbnail('https://cdn.public.blob.vercel-storage.com/cover.webp'),'https://cdn.public.blob.vercel-storage.com/cover.webp');
});
test('no unchecked media update can skip moderation',()=>{
 assert.deepEqual(reviewTransition('approve'),['pending','approved']);
 const api=readFileSync(new URL('../api-gallery-submissions.js',import.meta.url),'utf8');
 assert.match(api,/action==='mediaCreate'\|\|action==='mediaUpdate'/);
 assert.match(api,/status='pending',revision=revision\+1/);
 assert.match(api,/reviewed_at=NULL,reviewed_by=NULL/);
 assert.match(api,/const admin=await adminIdentity\(c,req\)/);
});
test('existing works survive optional submission table outage',()=>{
 const api=readFileSync(new URL('../api-gallery-items.js',import.meta.url),'utf8');
 assert.match(api,/optional gallery submissions:/);
 assert.match(api,/items\.unshift\(\.\.\.submitted\)/);
 assert.match(api,/WHERE status='approved'/);
 assert.doesNotMatch(api,/WHERE status IN \('approved','pending'\)/);
});
test('announcements never create tables during a request and keep failed draft',()=>{
 const api=readFileSync(new URL('../api-announcements.js',import.meta.url),'utf8');
 const page=readFileSync(new URL('../announcements-manage.html',import.meta.url),'utf8');
 assert.doesNotMatch(api,/CREATE TABLE\s+IF NOT EXISTS/i);
 assert.match(page,/入力内容は維持しています/);
 assert.match(page,/\$\('save'\)\.disabled=false/);
});
test('protected media page and route are included',()=>{
 const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 const admin=readFileSync(new URL('../admin-hub.html',import.meta.url),'utf8');
 const page=readFileSync(new URL('../media-manage.html',import.meta.url),'utf8');
 assert.ok(vercel.builds.some(x=>x.src==='media-manage.html'));
 assert.ok(vercel.routes.some(x=>x.src==='/media-manage.html'));
 assert.match(admin,/href="\/media-manage\.html"/);
 assert.match(page,/\/api\/gallery\/moderate/);
 assert.match(page,/authorizedDevice!==true/);
});

test('inline management scripts are syntactically valid',()=>{
 for(const name of ['announcements-manage.html','media-manage.html']){
  const html=readFileSync(new URL('../'+name,import.meta.url),'utf8');
  const start=html.indexOf('<script');
  const open=html.indexOf('>',start);
  const close=html.indexOf('</script>',open);
  const source=html.slice(open+1,close);
  assert.ok(start>=0&&open>start&&close>open,'script not found: '+name);
  assert.doesNotThrow(()=>new vm.Script(source,{filename:name}));
 }
});
test('schema creation is separate and enrollment data remains untouched',()=>{
 const files=['api-announcements.js','api-gallery-submissions.js','api-gallery-items.js'];
 for(const name of files){
  const body=readFileSync(new URL('../'+name,import.meta.url),'utf8');
  assert.doesNotMatch(body,/CREATE TABLE/i);
  assert.doesNotMatch(body,/emuzii_皆勤31日|SHEET_ID|APPS_SCRIPT_URL/);
 }
});
