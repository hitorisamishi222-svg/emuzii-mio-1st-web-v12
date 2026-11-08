import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planMuseumCuration} from '../museum-curation-plan.mjs';

const song={id:'mio-awakening-song',title:'翠の覚醒 -MIO-',category:'音声・楽曲',
 thumbnail:'/assets/gallery-emuzii-mio-cover.svg',hidden:false,deleted:false};
const video={id:'mio-awakening-video',title:'記念応援動画',category:'動画',
 thumbnail:'',hidden:false,deleted:false};
const closed={id:'mio-closed-work',title:'非公開の作品',category:'イラスト',
 thumbnail:'',hidden:true,deleted:false};
const input=()=>({
 catalog:[{...song},{...video},{...closed}],
 verifiedApprovedIds:[song.id,video.id],
 currentRevision:7,
 proposal:{expectedRevision:7,order:[video.id,closed.id,song.id],
   visibleIds:[video.id,song.id],featuredId:video.id}
});
const run=change=>planMuseumCuration(Object.assign(input(),change));
const invalid=(change,reason)=>assert.throws(()=>run(change),new RegExp('MUSEUM_PLAN_'+reason));

test('curation plan orders approved public works and picks exactly one featured work',()=>{
 const draft=run();
 assert.deepEqual(draft.preview.map(x=>x.id),[video.id,song.id]);
 assert.deepEqual(draft.preview.map(x=>x.featured),[true,false]);
 assert.equal(draft.candidateRevision,8);
 assert.equal(draft.approvedForPublication,false);
 assert.equal(draft.persisted,false);
 assert.equal(draft.preview.some(x=>x.id===closed.id),false);
});
test('curation preview does not mutate the source, and result objects are immutable',()=>{
 const value=input();
 const snapshot=structuredClone(value);
 const draft=planMuseumCuration(value);
 assert.deepEqual(value,snapshot);
 assert.ok(Object.isFrozen(draft));
 assert.ok(Object.isFrozen(draft.preview));
 assert.ok(Object.isFrozen(draft.preview[0]));
 assert.ok(Object.isFrozen(draft.orderedIds));
});
test('concurrent editing cannot silently overwrite a newer revision',()=>{
 invalid({proposal:{...input().proposal,expectedRevision:6}},'REVISION_CONFLICT');
 invalid({proposal:{...input().proposal,expectedRevision:8}},'REVISION_CONFLICT');
 invalid({proposal:{...input().proposal,expectedRevision:'7'}},'REVISION_CONFLICT');
});
test('revision counter must remain finite and cannot wrap',()=>{
 invalid({currentRevision:-1},'REVISION_INVALID');
 invalid({currentRevision:0.5},'REVISION_INVALID');
 invalid({currentRevision:Number.MAX_SAFE_INTEGER},'REVISION_INVALID');
});
test('every known item must remain in the order list even when not public',()=>{
 invalid({proposal:{...input().proposal,order:[song.id,video.id]}},'ORDER_INVALID');
 invalid({proposal:{...input().proposal,order:[song.id,song.id,closed.id]}},'ORDER_INVALID');
 invalid({proposal:{...input().proposal,order:[song.id,video.id,'unknown-id']}},'ORDER_INVALID');
});
test('catalog cannot contain duplicate, invalid or unchecked item IDs',()=>{
 invalid({catalog:[song,{...song}]},'CATALOG_INVALID');
 invalid({catalog:[{...song,id:'another/../../item'}]},'CATALOG_INVALID');
 invalid({catalog:[{...song,title:''}]},'CATALOG_INVALID');
 invalid({catalog:[{...song,deleted:null}]},'CATALOG_INVALID');
 invalid({catalog:[{...song,hidden:undefined}]},'CATALOG_INVALID');
});
test('invalid image URLs cannot slip into a later public preview',()=>{
 invalid({catalog:[{...song,thumbnail:'javascript:alert(1)'}]},'CATALOG_INVALID');
 invalid({catalog:[{...song,thumbnail:'https://evil.example/secret.png'}]},'CATALOG_INVALID');
 invalid({catalog:[{...song,thumbnail:'/assets/../../secret.png'}]},'CATALOG_INVALID');
});
test('server-authoritative approved IDs cannot be absent or contradictory',()=>{
 invalid({verifiedApprovedIds:undefined},'APPROVAL_INVALID');
 invalid({verifiedApprovedIds:[song.id,song.id]},'APPROVAL_INVALID');
 invalid({verifiedApprovedIds:[song.id,'unknown-id']},'APPROVAL_INVALID');
 invalid({verifiedApprovedIds:'mio-awakening-song'},'APPROVAL_INVALID');
});
test('unapproved, hidden and deleted works remain private when a manager drafts a layout',()=>{
 const items=input().catalog;
 invalid({verifiedApprovedIds:[song.id],proposal:{...input().proposal}},'VISIBILITY_UNAPPROVED');
 invalid({verifiedApprovedIds:[song.id,video.id,closed.id],
  proposal:{...input().proposal,visibleIds:[song.id,closed.id]}},'VISIBILITY_UNAPPROVED');
 invalid({catalog:items.map(i=>i.id===video.id?{...i,deleted:true}:i)},'VISIBILITY_UNAPPROVED');
});
test('featured work must be visible and otherwise use explicit null',()=>{
 invalid({proposal:{...input().proposal,featuredId:closed.id}},'FEATURE_INVALID');
 invalid({proposal:{...input().proposal,featuredId:'unknown-id'}},'FEATURE_INVALID');
 invalid({proposal:{...input().proposal,featuredId:undefined}},'FEATURE_INVALID');
 const proposal={...input().proposal,visibleIds:[],featuredId:null};
 assert.deepEqual(run({proposal}).preview,[]);
});
test('unaudited fields or speculative publishing flags cannot enter the edit proposal',()=>{
 invalid({proposal:{...input().proposal,adminApproved:true}},'PROPOSAL_INVALID');
 invalid({proposal:{...input().proposal,releaseNow:true}},'PROPOSAL_INVALID');
 invalid({proposal:{...input().proposal,cookie:'private'}},'PROPOSAL_INVALID');
});
test('draft output exposes no opaque auth fields or raw record objects',()=>{
 const result=run();
 assert.deepEqual(Object.keys(result.preview[0]).sort(),['category','featured','id','thumbnail','title']);
 assert.equal(JSON.stringify(result).includes('token'),false);
 assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('module remains pure and cannot fetch or publish the gallery',()=>{
 const src=readFileSync(new URL('../museum-curation-plan.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|\binnerHTML\s*=|\/api\/gallery/i);
 assert.doesNotMatch(src,/\bimport\s+.*(?:pg|vercel|fs)|\.query\s*\(|\bINSERT\s+INTO\b|\bUPDATE\s+gallery/i);
 assert.match(src,/approvedForPublication:false/);
 assert.match(src,/persisted:false/);
});
