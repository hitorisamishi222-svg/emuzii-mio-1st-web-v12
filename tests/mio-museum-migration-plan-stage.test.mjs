import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 assessMuseumMigrationPlanStage as assess,
 museumMigrationSourceManifestStage as manifest,
 museumMigrationTargetTablesStage as targets,
 museumMigrationOrderStage as order
} from '../museum-migration-plan-stage.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const files=()=>Object.fromEntries(order.map(path=>[path,read(path)]));
const legacy=['anniversary_announcements','gallery_admin_audit','gallery_admin_challenges',
 'gallery_admin_device_requests','gallery_admin_devices','gallery_admin_owner_invites',
 'gallery_admin_passkeys','gallery_admin_sessions','gallery_admin_users','gallery_live_overrides',
 'gallery_published_items','mio_gacha_admin_challenges','mio_gacha_admin_credentials','mio_gacha_admin_sessions'];
const params=()=>({
 candidateFiles:files(),observedTableNames:[...legacy],
 independentBranchVerified:false,previewBindingVerified:false,
 restorationDrillVerified:false,ownerApproved:false
});
test('the three draft migration sources are byte-locked, ordered by dependency and unexecuted',()=>{
 assert.deepEqual(targets,[
  'museum_public_exhibits','museum_gallery_layout_stage','museum_gallery_layout_history_stage',
  'museum_gallery_layout_audit_stage','museum_exhibit_draft_operations_stage'
 ]);
 assert.deepEqual(order,[
  'db/museum-public-exhibits.sql','db/museum-gallery-layout-stage.sql',
  'db/museum-exhibit-draft-operations-stage.sql'
 ]);
 assert.equal(manifest.length,3);
 const result=assess(params());
 assert.equal(result.schemaSourceLocked,true);
 assert.deepEqual(result.missingTargetTables,targets);
 assert.deepEqual(result.previouslyExistingTargets,[]);
 assert.deepEqual(result.missingLegacyDependencies,[]);
 assert.deepEqual(result.blockers,[
  'independent_isolated_branch_verified','preview_binding_verified',
  'recovery_drill_verified','owner_approved'
 ]);
 for(const key of ['hasExecutableMigration','canMigrate','canWrite','canPublish',
  'canDeploy','didConnect','didReadSecrets','didExecuteSql'])
  assert.equal(result[key],false,key);
 for(const key of ['checks','blockers','missingTargetTables','previouslyExistingTargets'])
  assert.equal(Object.isFrozen(result[key]),true,key);
});
test('even synthetic all-true gates never become an executable migration authorization',()=>{
 const input=params();
 Object.assign(input,{
  independentBranchVerified:true,previewBindingVerified:true,
  restorationDrillVerified:true,ownerApproved:true
 });
 const result=assess(input);
 assert.equal(result.preflightMetadataComplete,true);
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.actualProviderProvenanceVerified,false);
 assert.equal(result.hasExecutableMigration,false);
 assert.equal(result.canMigrate,false);
 assert.equal(result.canWrite,false);
});
test('altered candidate source, extra statements, missing sources and wrong keys fail closed',()=>{
 for(const change of [
  c=>{c[order[0]]+='\nDROP TABLE gallery_admin_users;\n';},
  c=>{c[order[0]]=c[order[0]].replace('CREATE TABLE','CREATE UNLOGGED TABLE');},
  c=>{c[order[2]]+=' -- harmless edit';},
  c=>{delete c[order[2]];},
  c=>{c['db/museum-extra.sql']='CREATE TABLE museum_extra()';}
 ]){
  const input=params();change(input.candidateFiles);
  assert.throws(()=>assess(input),/MUSEUM_MIGRATION_(CANDIDATE_CHANGED|INPUT_INVALID)/);
 }
});
test('partially installed museum tables cannot be hidden by IF NOT EXISTS',()=>{
 const x=params();
 x.observedTableNames.push('museum_public_exhibits');
 const result=assess(x);
 assert.deepEqual(result.previouslyExistingTargets,['museum_public_exhibits']);
 assert.equal(result.missingTargetTables.length,4);
 assert.equal(result.checks.candidate_targets_entirely_absent,false);
 assert.ok(result.blockers.includes('candidate_targets_entirely_absent'));
 assert.equal(result.preflightMetadataComplete,false);
});
test('missing original owner/session/legacy gallery dependencies block plan',()=>{
 const x=params();
 x.observedTableNames=x.observedTableNames.filter(t=>t!=='gallery_admin_users');
 const result=assess(x);
 assert.deepEqual(result.missingLegacyDependencies,['gallery_admin_users']);
 assert.equal(result.checks.existing_gallery_dependencies_present,false);
 assert.equal(result.canMigrate,false);
});
test('malformed or duplicate catalog metadata is rejected without querying live data',()=>{
 for(const mutation of [
  x=>{x.observedTableNames.push(x.observedTableNames[0]);},
  x=>{x.observedTableNames.push('invalid; DROP TABLE gallery_admin_users');},
  x=>{x.observedTableNames=null;},
  x=>{x.candidateFiles=null;},
  x=>{x.candidateFiles=[];},
  x=>{x.candidateFiles[order[1]]=undefined;}
 ]){
  const x=params();mutation(x);
  assert.throws(()=>assess(x),/MUSEUM_MIGRATION_(INPUT_INVALID|CANDIDATE_CHANGED)/);
 }
});
test('preflight never becomes a public route, client, or existing-data mutation',()=>{
 const source=read('museum-migration-plan-stage.mjs');
 const conf=JSON.parse(read('vercel.json'));
 assert.equal(conf.builds.some(x=>x.src==='museum-migration-plan-stage.mjs'),false);
 assert.equal(conf.routes.some(x=>x.src==='/museum-migration-plan-stage.mjs'),false);
 assert.doesNotMatch(source,/process\.env|export default|\.query\s*\(|\.connect\s*\(|\bfetch\s*\(|DELETE FROM|UPDATE\s+gallery|INSERT INTO|ALTER TABLE|DROP TABLE/);
 for(const path of order){
  const sql=read(path);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS museum_/);
  assert.doesNotMatch(sql,/^\s*(?:DROP|DELETE|INSERT|UPDATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/im);
 }
});
