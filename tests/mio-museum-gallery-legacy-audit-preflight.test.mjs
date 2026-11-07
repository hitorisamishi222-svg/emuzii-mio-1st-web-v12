import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectMuseumLegacyGalleryAuditStage} from '../museum-gallery-legacy-audit-preflight.mjs';
const song='mio-awakening-song',video='mio-awakening-video';
const select=rows=>({command:'SELECT',rowCount:rows.length,rows});
function mock({overrides=[],audit=[],failureAt=null,badAudit=false,commitLost=false}={}){
 return {calls:[],rollbackCount:0,async query(sql,args=[]){
  this.calls.push({sql,args});
  if(this.calls.length===failureAt)throw Error('password=do-not-leak@privatehost');
  if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')return {command:'BEGIN'};
  if(sql==='COMMIT')return {command:commitLost?'UNKNOWN':'COMMIT'};
  if(sql==='ROLLBACK'){this.rollbackCount++;return {command:'ROLLBACK'};}
  if(sql.includes('FROM gallery_live_overrides'))return select(overrides);
  if(sql.includes('FROM gallery_admin_audit'))return badAudit?
   {command:'SELECT',rowCount:3,rows:[]} :select(audit);
  throw Error('Unexpected or mutating SQL '+sql);
 }};
}
const inspect=db=>inspectMuseumLegacyGalleryAuditStage(db);
test('untouched public allowlist has no invented override history',async()=>{
 const db=mock(),r=await inspect(db);
 assert.equal(r.auditCountsConsistent,true);
 assert.equal(r.checkedWorks,2);
 assert.equal(r.versionsWithHistory,0);
 assert.equal(r.mismatchCount,0);
 assert.equal(r.identityVerified,false);
 assert.equal(r.backupVerified,false);
 assert.equal(r.canDeploy,false);
 assert.equal(db.calls.length,4);
 assert.equal(db.calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(db.calls.at(-1).sql,'COMMIT');
 assert.equal(db.calls[1].args[0].includes(song),true);
 assert.equal(db.calls[1].args[0].includes(video),true);
 assert.equal(db.calls[2].sql.includes('actor_id'),false);
 assert.equal(db.calls[2].sql.includes('token'),false);
 assert.ok(db.calls.every(c=>!/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i.test(c.sql)));
});
test('matching revisions and successful actions pass as provisional audit consistency',async()=>{
 const db=mock({
  overrides:[{item_id:song,revision:'3'},{item_id:video,revision:'1'}],
  audit:[{item_id:song,audit_count:'3'},{item_id:video,audit_count:'1'}]
 });
 const r=await inspect(db);
 assert.equal(r.auditCountsConsistent,true);
 assert.equal(r.versionsWithHistory,2);
 assert.equal(r.mismatchCount,0);
 assert.equal(r.didModifyProduction,false);
});
test('a physical removal of the override does not erase surviving evidence of its edits',async()=>{
 const db=mock({overrides:[],audit:[{item_id:song,audit_count:'2'}]});
 const r=await inspect(db);
 assert.equal(r.auditCountsConsistent,false);
 assert.equal(r.mismatchCount,1);
 assert.equal(r.canDeploy,false);
});
test('a silently reset revision or pruned audit history blocks the readiness report',async()=>{
 for(const data of [
  {overrides:[{item_id:song,revision:'1'}],audit:[]},
  {overrides:[{item_id:song,revision:'1'}],audit:[{item_id:song,audit_count:'3'}]},
  {overrides:[{item_id:song,revision:'3'}],audit:[{item_id:song,audit_count:'1'}]}
 ]){
  const r=await inspect(mock(data));
  assert.equal(r.auditCountsConsistent,false);
  assert.equal(r.mismatchCount,1);
 }
});
test('untrusted or malformed revision rows never become readiness proof',async()=>{
 for(const revision of ['-1','1.5','9007199254740993',null,0]){
  await assert.rejects(()=>inspect(mock({overrides:[{item_id:song,revision}]})),
   /MUSEUM_AUDIT_(COUNT_INVALID|OVERRIDE_REVISION_INVALID)/);
 }
 for(const values of [
  [{item_id:song,revision:'1'},{item_id:song,revision:'2'}],
  [{item_id:'unknown',revision:'1'}]
 ]){
  await assert.rejects(()=>inspect(mock({overrides:values})),
   /MUSEUM_AUDIT_OVERRIDE_ROW_INVALID/);
 }
});
test('audits with unknown work IDs, duplicated IDs or invalid counts fail closed',async()=>{
 for(const audit of [
  [{item_id:'unknown',audit_count:'1'}],
  [{item_id:song,audit_count:'1'},{item_id:song,audit_count:'2'}],
  [{item_id:song,audit_count:'0'}],
  [{item_id:song,audit_count:'many'}]
 ]){
  await assert.rejects(()=>inspect(mock({audit})),
   /MUSEUM_AUDIT_(AUDIT_ROW_INVALID|AUDIT_COUNT_INVALID|COUNT_INVALID)/);
 }
});
test('only success records for saved, hidden, shown, archived and restored works are aggregated',async()=>{
 const db=mock();
 await inspect(db);
 const sql=db.calls[2].sql;
 assert.ok(sql.includes("result='success'"));
 assert.ok(sql.includes('action=ANY($2::text[])'));
 assert.deepEqual(db.calls[2].args[1],[
  'gallery_save','gallery_hide','gallery_show','gallery_delete','gallery_restore'
 ]);
 assert.ok(sql.includes('COUNT(*)'));
 assert.ok(sql.includes('GROUP BY target'));
});
test('broken result or PG error is masked and the read-only transaction rolls back',async()=>{
 for(const config of [{badAudit:true},{failureAt:2},{failureAt:3}]){
  const db=mock(config);
  await assert.rejects(()=>inspect(db),e=>{
   assert.equal(e.message.includes('password='),false);
   assert.match(e.message,/^MUSEUM_AUDIT_/);return true;
  });
  assert.equal(db.rollbackCount,1);
  assert.equal(db.calls.at(-1).sql,'ROLLBACK');
 }
});
test('commit acknowledgement is required even for the read-only audit report',async()=>{
 const db=mock({commitLost:true});
 await assert.rejects(()=>inspect(db),/MUSEUM_AUDIT_READ_COMMIT_UNVERIFIED/);
 assert.equal(db.rollbackCount,1);
});
test('audit preflight is neither an API route nor a database writer',()=>{
 const src=readFileSync(new URL('../museum-gallery-legacy-audit-preflight.mjs',import.meta.url),'utf8');
 const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(src,/export default|process\.env|\.connect\(|new Pool|INSERT INTO|UPDATE gallery_live|DELETE FROM|TRUNCATE/);
 assert.equal(vercel.routes.some(x=>x.dest==='/museum-gallery-legacy-audit-preflight.mjs'),false);
 assert.equal(vercel.builds.some(x=>x.src==='museum-gallery-legacy-audit-preflight.mjs'),false);
});
