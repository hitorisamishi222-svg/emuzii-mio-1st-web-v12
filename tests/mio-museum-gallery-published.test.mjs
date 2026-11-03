import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectPublishedMuseumGallery} from '../museum-gallery-published-core.mjs';

const song={id:'mio-awakening-song',title:'翠の覚醒 -MIO-',
 creator:'翠央1周年 記念曲',category:'音声・楽曲',description:'記念楽曲',
 url:'/mio-awakening.mp3',thumbnail:'',hidden:false,deleted:false};
const video={id:'mio-awakening-video',title:'記念応援動画',
 creator:'えむじー🐱',category:'動画',description:'',
 url:'https://vt.tiktok.com/ZSgFvmy7Q/',
 thumbnail:'/assets/gallery-emuzii-mio-cover.svg',hidden:false,deleted:false};
const archived={id:'mio-private-work',title:'非公開の展示',creator:'権利者',
 category:'イラスト',description:'非公開',url:'https://example.com/work',
 thumbnail:'',hidden:true,deleted:false};
const fixture=()=>({
 authoritativeCatalog:[{...song},{...video},{...archived}],
 verifiedApprovedIds:[song.id,video.id],
 sourceVerified:true,
 publishedLayout:{
  revision:4,order:[video.id,archived.id,song.id],
  visibleIds:[video.id,song.id],featuredId:video.id
 }
});
const view=(patch={})=>projectPublishedMuseumGallery({...fixture(),...patch});
const rejects=(patch,code)=>assert.throws(()=>view(patch),new RegExp('MUSEUM_PUBLIC_'+code));

test('published gallery shows only verified approved items in published order',()=>{
 const out=view();
 assert.equal(out.published,true);
 assert.equal(out.revision,4);
 assert.deepEqual(out.items.map(i=>i.id),[video.id,song.id]);
 assert.deepEqual(out.items.map(i=>i.featured),[true,false]);
 assert.equal(out.items.some(i=>i.id===archived.id),false);
});
test('editing a draft cannot change an already-published layout snapshot',()=>{
 const original=fixture();
 const snapshot=structuredClone(original.publishedLayout);
 const preview=projectPublishedMuseumGallery(original);
 const localDraft={order:[song.id,video.id,archived.id],
  visibleIds:[song.id],featuredId:song.id};
 assert.equal(localDraft.featuredId,song.id);
 assert.deepEqual(original.publishedLayout,snapshot);
 assert.deepEqual(preview.items.map(i=>i.id),[video.id,song.id]);
});
test('a missing published layout shows no new museum exhibits; no unauthorized fallback',()=>{
 const out=view({publishedLayout:null});
 assert.deepEqual(out.items,[]);
 assert.equal(out.published,false);
 assert.equal(out.revision,null);
});
test('live moderation hide supersedes a previously published featured exhibit',()=>{
 const items=fixture().authoritativeCatalog;
 items[1].hidden=true;
 const result=view({authoritativeCatalog:items});
 assert.deepEqual(result.items.map(x=>x.id),[song.id]);
 assert.equal(result.items.some(x=>x.featured),false);
});
test('deleted, unapproved, or no-longer-listed items are never displayed',()=>{
 const items=fixture().authoritativeCatalog;
 items[0].deleted=true;
 assert.deepEqual(view({authoritativeCatalog:items}).items.map(x=>x.id),[video.id]);
 assert.deepEqual(view({verifiedApprovedIds:[song.id]}).items.map(x=>x.id),[song.id]);
 const absent=fixture().authoritativeCatalog.filter(x=>x.id!==song.id);
 assert.deepEqual(view({authoritativeCatalog:absent,verifiedApprovedIds:[video.id]})
  .items.map(x=>x.id),[video.id]);
});
test('public projection does not grant a published flag to a preview or grant visibility',()=>{
 rejects({sourceVerified:false},'SOURCE_UNVERIFIED');
 rejects({sourceVerified:undefined},'SOURCE_UNVERIFIED');
 rejects({verifiedApprovedIds:undefined},'SOURCE_UNVERIFIED');
 rejects({authoritativeCatalog:null},'SOURCE_UNVERIFIED');
 rejects({authoritativeCatalog:[]},'APPROVAL_MISMATCH');
});
test('inconsistent or duplicate approval proofs fail closed',()=>{
 rejects({verifiedApprovedIds:[song.id,song.id]},'SOURCE_UNVERIFIED');
 rejects({verifiedApprovedIds:[song.id,'missing-work']},'APPROVAL_MISMATCH');
});
test('published snapshot must be fully structured and revisioned',()=>{
 rejects({publishedLayout:undefined},'LAYOUT_INVALID');
 rejects({publishedLayout:{...fixture().publishedLayout,revision:-1}},'LAYOUT_INVALID');
 rejects({publishedLayout:{...fixture().publishedLayout,revision:'4'}},'LAYOUT_INVALID');
 rejects({publishedLayout:{...fixture().publishedLayout,order:[song.id,song.id]}},'LAYOUT_INVALID');
 rejects({publishedLayout:{...fixture().publishedLayout,visibleIds:[video.id,video.id]}},'LAYOUT_INVALID');
});
test('featured selection must be present in published visible IDs',()=>{
 rejects({publishedLayout:{...fixture().publishedLayout,featuredId:archived.id}},'LAYOUT_INVALID');
 rejects({publishedLayout:{...fixture().publishedLayout,featuredId:'mio-unknown'}},'LAYOUT_INVALID');
 const result=view({publishedLayout:{...fixture().publishedLayout,featuredId:null}});
 assert.equal(result.items.some(i=>i.featured),false);
});
test('only the published visible IDs, not merely order, become visible',()=>{
 const result=view({publishedLayout:{...fixture().publishedLayout,visibleIds:[song.id],
  featuredId:null}});
 assert.deepEqual(result.items.map(i=>i.id),[song.id]);
 rejects({publishedLayout:{...fixture().publishedLayout,visibleIds:[song.id,'unlisted'],
  featuredId:null}},'LAYOUT_INVALID');
});
test('image-only museum records may omit a click-through link without being made clickable',()=>{
 const catalog=fixture().authoritativeCatalog.map(x=>x.id===video.id?{...x,url:''}:x);
 const result=view({authoritativeCatalog:catalog});
 const record=result.items.find(x=>x.id===video.id);
 assert.equal(record.url,'');
 assert.equal(record.featured,true);
});
test('malicious or malformed gallery metadata never reaches public cards',()=>{
 const bad=key=>fixture().authoritativeCatalog.map(x=>x.id===video.id?{...x,[key]:
  key==='url'?'javascript:alert(1)':key==='thumbnail'?'https://evil.invalid/x.png':x[key]}:x);
 rejects({authoritativeCatalog:bad('url')},'CATALOG_INVALID');
 rejects({authoritativeCatalog:bad('thumbnail')},'CATALOG_INVALID');
 rejects({authoritativeCatalog:[{...song,url:'//attacker.test/payload'},video,archived]},'CATALOG_INVALID');
 rejects({authoritativeCatalog:[{...song,thumbnail:'/assets/../../private.png'},video,archived]},'CATALOG_INVALID');
 rejects({authoritativeCatalog:[{...song,title:'\u0000bad'},video,archived]},'CATALOG_INVALID');
});
test('catalog cannot contain duplicate IDs or ambiguous hidden and deleted fields',()=>{
 rejects({authoritativeCatalog:[song,{...song},video]},'CATALOG_INVALID');
 rejects({authoritativeCatalog:[{...song,deleted:null},video]},'CATALOG_INVALID');
 rejects({authoritativeCatalog:[{...song,hidden:undefined},video]},'CATALOG_INVALID');
});
test('public cards exclude device/session/admin and internal metadata',()=>{
 const catalog=fixture().authoritativeCatalog.map(x=>({...x,
  token:'sensitive',device:'private',rightsReview:'not-for-public'}));
 const out=view({authoritativeCatalog:catalog});
 const json=JSON.stringify(out);
 assert.equal(json.includes('sensitive'),false);
 assert.equal(json.includes('not-for-public'),false);
 assert.deepEqual(Object.keys(out.items[0]).sort(),
  ['category','creator','description','featured','id','thumbnail','title','url']);
});
test('results are detached, immutable and have no runtime side effects',()=>{
 const input=fixture();
 const before=structuredClone(input);
 const result=projectPublishedMuseumGallery(input);
 assert.deepEqual(input,before);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.items),true);
 assert.equal(Object.isFrozen(result.items[0]),true);
 assert.notStrictEqual(result.items[0],input.authoritativeCatalog[1]);
});
test('public core is isolated from DB, storage, cookies and production URLs',()=>{
 const source=readFileSync(new URL('../museum-gallery-published-core.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|document\.cookie|localStorage|sessionStorage|indexedDB/i);
 assert.doesNotMatch(source,/\.query\s*\(|\b(?:INSERT|DELETE|UPDATE|ALTER|DROP|TRUNCATE)\b/i);
 assert.doesNotMatch(source,/process\.env|gallery_admin_sessions|BRIDGE_SECRET|@vercel\/blob/i);
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.builds.some(x=>x.src==='museum-gallery-published-core.mjs'),false);
 assert.equal(config.routes.some(x=>x.dest==='/museum-gallery-published-core.mjs'),false);
});
