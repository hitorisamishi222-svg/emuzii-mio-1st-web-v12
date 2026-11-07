import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareMuseumDraftEditorHandoffStage as handoff} from '../museum-exhibit-editor-handoff-stage.mjs';
import {prepareMuseumExhibitFormDraftStage} from '../museum-exhibit-ui-contract-stage.mjs';

const A='44444444-4444-4444-8444-444444444444';
const B='55555555-5555-4555-8555-555555555555';
const initial=()=>({
 found:true,editable:true,onlyPrivateDrafts:true,
 item:{
  id:A,revision:3,status:'draft',editable:true,
  room:'icons',category:'イラスト',title:'架空のアイコン',
  description:'作成者確認前の非公開下書き',credit:'架空の作者',
  occurredOn:'2026-11-05',externalUrl:'https://example.org/work',
  imageUrl:'/assets/gallery-emuzii-mio-cover.svg',
  updatedAt:'2026-11-06T05:01:02.000Z'
 }
});
const select=(result=initial(),opts={})=>handoff(result,{
 selectedId:A,selectedRevision:3,...opts
});
test('one verified draft projects to a seven-field edit form without any publication or auth flags',()=>{
 const x=select();
 assert.deepEqual(x,{
  mode:'edit',exhibitId:A,expectedRevision:3,
  fields:{
   room:'icons',category:'イラスト',title:'架空のアイコン',
   description:'作成者確認前の非公開下書き',credit:'架空の作者',
   occurredOn:'2026-11-05',externalUrl:'https://example.org/work'
  },
  existingCoverPreviewUrl:'/assets/gallery-emuzii-mio-cover.svg',
  imageIsReadOnly:true,requiresFreshReviewOnSave:true,
  authorizedToWrite:false,readyToPublish:false
 });
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.fields),true);
 const dbDraft=prepareMuseumExhibitFormDraftStage(x.fields);
 assert.equal(dbDraft.imageUrl,'','owner form intentionally has no image setter');
 assert.equal(dbDraft.kind,'icons');
 assert.equal(dbDraft.category,'イラスト');
 assert.equal('imageUrl' in x.fields,false);
 assert.equal('status' in x.fields,false);
 assert.equal('rightsChecked' in x.fields,false);
 assert.equal('userId' in x.fields,false);
});
test('dirty form cannot be silently replaced; discard must be an explicit UI choice',()=>{
 assert.throws(()=>select(initial(),{currentFormDirty:true}),
  /MUSEUM_EDITOR_HANDOFF_UNSAVED_FORM/);
 const after=select(initial(),{currentFormDirty:true,confirmedDiscard:true});
 assert.equal(after.fields.title,'架空のアイコン');
 assert.equal(after.expectedRevision,3);
 for(const bad of [{currentFormDirty:'yes'},{confirmedDiscard:1}]){
  assert.throws(()=>select(initial(),bad),/MUSEUM_EDITOR_HANDOFF_UI_STATE_INVALID/);
 }
});
test('selection ID or revision mismatches never load another work into the form',()=>{
 for(const opts of [
  {selectedId:B},{selectedRevision:2},
  {selectedRevision:4},{selectedRevision:'3'},
  {selectedId:'../../private'}, {selectedId:'44444444-4444-4444-8444-444444444444 OR true'},
  {selectedRevision:-1},{selectedRevision:2147483648}
 ]){
  assert.throws(()=>select(initial(),opts),
   /MUSEUM_EDITOR_HANDOFF_(SELECTION_INVALID|STALE_OR_WRONG_SELECTION)/);
 }
});
test('published, hidden, trashed or nonexistent works never enter the editor',()=>{
 for(const status of ['published','hidden','trash']){
  const x=initial();x.item.status=status;
  assert.throws(()=>select(x),/MUSEUM_EDITOR_HANDOFF_NOT_EDITABLE/);
 }
 for(const modified of [
  x=>{x.found=false;x.item=null;x.editable=false},
  x=>{x.editable=false},
  x=>{x.onlyPrivateDrafts=false},
  x=>{x.item.editable=false},
  x=>{x.item.id=123},
  x=>{x.item.id=B}
 ]){
  const x=initial();modified(x);
  assert.throws(()=>select(x),/MUSEUM_EDITOR_HANDOFF_(DETAIL_UNVERIFIED|NOT_EDITABLE|STALE_OR_WRONG_SELECTION)/);
 }
});
test('malicious fields, untrusted image URLs and malformed dates are blocked',()=>{
 for(const modified of [
  x=>{x.item.title='\u0000'},
  x=>{x.item.title=''},
  x=>{x.item.title='x'.repeat(121)},
  x=>{x.item.description='x'.repeat(2001)},
  x=>{x.item.credit='x'.repeat(81)},
  x=>{x.item.room='private'},
  x=>{x.item.category='archivedSecret'},
  x=>{x.item.externalUrl='javascript:alert(1)'},
  x=>{x.item.externalUrl='http://example.org'},
  x=>{x.item.externalUrl='https://example.org/#fragment'},
  x=>{x.item.imageUrl='https://untrusted.invalid/private.png'},
  x=>{x.item.imageUrl='data:image/png;base64,AAAA'},
  x=>{x.item.imageUrl='/assets/../private.png'},
  x=>{x.item.occurredOn='2026-02-30'},
  x=>{x.item.updatedAt='2026-11-06T05:01:02Z'}
 ]){
  const x=initial();modified(x);
  assert.throws(()=>select(x),/MUSEUM_EDITOR_HANDOFF_(CONTENT_INVALID|DETAIL_UNVERIFIED)/);
 }
});
test('cannot sneak additional body fields, moderation flags, owner identities or review approval',()=>{
 for(const modified of [
  x=>{x.publish=true},
  x=>{x.item.ownerId='private-id'},
  x=>{x.item.status='draft';x.item.rightsOk=true},
  x=>{x.item.rawPrivateScreenshot='secret'},
  x=>{x.item.actor_id='owner-identity'}
 ]){
  const x=initial();modified(x);
  assert.throws(()=>select(x),/MUSEUM_EDITOR_HANDOFF_DETAIL_UNVERIFIED/);
 }
});
test('handoff remains pure, unmounted and cannot save, upload, or publish itself',()=>{
 const path='museum-exhibit-editor-handoff-stage.mjs';
 const content=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const conf=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(conf.builds.some(x=>x.src===path),false);
 assert.equal(conf.routes.some(x=>x.src==='/'+path||x.dest==='/'+path),false);
 assert.doesNotMatch(content,/export default|process\.env|\bfetch\s*\(|\.query\s*\(|\.connect\s*\(|new Pool|document\.cookie|\bINSERT INTO\b|\bUPDATE museum_public_exhibits\b|\bDELETE FROM\b/);
 for(const path of ['museum.html','museum-approved-gallery.html','museum-archive.html']){
  assert.equal(readFileSync(new URL('../'+path,import.meta.url),'utf8')
   .includes('museum-exhibit-editor-handoff'),false);
 }
});
