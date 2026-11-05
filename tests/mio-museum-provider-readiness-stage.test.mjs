import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessMuseumProviderReadinessStage as inspect,
 requiredMuseumProviderTables as required} from '../museum-provider-readiness-stage.mjs';

const GALLERY='br-gallery-test01';
const MAIN='br-prod-test001';
const PROJECT='dry-museum-demo01';
const BRANCH='feature/mio-v2-integration-mainbaseline-20261102';
const sha='a'.repeat(40);
const record=()=>({
 previewVariables:[
  {key:'MIO_MUSEUM_GALLERY_DATABASE_URL',id:'scoped',type:'encrypted',
   target:['preview'],gitBranch:BRANCH},
  {key:'GALLERY_DATABASE_URL',id:'existing-prod',type:'encrypted',
   target:['production']}
 ],
 deployment:{projectId:'prj_MuseumDemo',target:'preview',
  gitBranch:BRANCH,gitSha:sha},
 expected:{vercelProjectId:'prj_MuseumDemo',candidateSha:sha,
  neonProjectId:PROJECT,galleryBranchId:GALLERY,
  productionBranchId:MAIN,databaseName:'neondb'},
 neonBranches:[
  {id:MAIN,name:'main',primary:true},
  {id:GALLERY,name:'gallery-admin-isolated',primary:false,parent_id:MAIN}
 ],
 neonDatabases:[{name:'neondb'}],
 neonTables:required.map(table_name=>({table_name})),
 neonSnapshots:[{id:'snapshot-demo',branch_id:GALLERY}]
});
test('complete synthetic provider metadata is still not permission to write, migrate or release',()=>{
 const result=inspect(record());
 assert.equal(result.metadataInventoryComplete,true);
 assert.deepEqual(result.blockers,[]);
 assert.deepEqual(result.missingTables,[]);
 for(const key of ['canConnect','canMigrate','canWrite','canDeploy',
  'restorationDrillVerified','actualConnectionBindingVerified',
  'ownerAuthorizationVerified','didQueryDb','didReadSecrets','didChangeProvider'])
  assert.equal(result[key],false,key);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.blockers),true);
});
test('observed 2026-11-05 situation stays blocked: generic Preview, four missing museum tables, no snapshot',()=>{
 // Sanitized inventory shape observed through Vercel/Neon metadata calls.
 // This is a test fixture, NOT an authorization or a live DB connection.
 const data=record();
 data.previewVariables=[
  {key:'GALLERY_DATABASE_URL',id:'generic',target:['preview'],type:'encrypted'},
  {key:'GALLERY_DATABASE_URL',id:'other-branch',target:['preview'],
   gitBranch:'fix/announcements-passkey-auth-review',type:'encrypted'},
  {key:'GALLERY_DATABASE_URL',id:'production',target:['production'],type:'encrypted'}
 ];
 data.neonTables=data.neonTables.filter(t=>!t.table_name.startsWith('museum_'));
 data.neonSnapshots=[];
 const result=inspect(data);
 assert.equal(result.metadataInventoryComplete,false);
 assert.deepEqual(result.blockers,[
  'preview_environment_isolated','schema_table_inventory_complete',
  'snapshot_inventory_present'
 ]);
 assert.deepEqual(result.missingTables,[
  'museum_public_exhibits','museum_gallery_layout_stage',
  'museum_gallery_layout_history_stage','museum_gallery_layout_audit_stage'
 ]);
 assert.equal(result.checks.neon_gallery_branch_isolated,true);
 assert.equal(result.checks.neon_database_present,true);
});
test('a primary branch, unknown project branch, or absent database never becomes a ready inventory',()=>{
 for(const mutation of [
  v=>{v.neonBranches[1].primary=true},
  v=>{v.neonBranches[1].parent_id='br-unrelated'},
  v=>{v.neonBranches[1].name='main'},
  v=>{v.expected.galleryBranchId=v.expected.productionBranchId},
  v=>{v.neonBranches=v.neonBranches.slice(1)},
  v=>{v.neonDatabases=[]}
 ]){
  const v=record();mutation(v);
  assert.equal(inspect(v).metadataInventoryComplete,false);
 }
});
test('missing or duplicate tables and irrelevant snapshots are not proof',()=>{
 const missing=record();
 missing.neonTables=missing.neonTables.filter(x=>x.table_name!=='museum_public_exhibits');
 assert.equal(inspect(missing).checks.schema_table_inventory_complete,false);
 const duplicate=record();duplicate.neonTables.push({...duplicate.neonTables[0]});
 assert.equal(inspect(duplicate).checks.schema_table_inventory_complete,false);
 const snapshot=record();
 snapshot.neonSnapshots=[{id:'from-production',branch_id:MAIN}];
 assert.equal(inspect(snapshot).checks.snapshot_inventory_present,false);
});
test('malformed or partial inventories are rejected without an eligibility result',()=>{
 for(const mutation of [
  v=>{v.neonBranches=null},
  v=>{v.neonDatabases='neondb'},
  v=>{v.neonTables={}},
  v=>{v.neonSnapshots=undefined},
  v=>{v.expected=null}
 ]){
  const v=record();mutation(v);
  assert.throws(()=>inspect(v),/MUSEUM_INVENTORY_METADATA_INVALID/);
 }
 assert.throws(()=>inspect(),/MUSEUM_INVENTORY_METADATA_INVALID/);
});
test('the inventory evaluator is not a routed API or a provider client',()=>{
 const source=readFileSync(new URL('../museum-provider-readiness-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.builds.some(x=>x.src==='museum-provider-readiness-stage.mjs'),false);
 assert.equal(config.routes.some(x=>x.dest==='/museum-provider-readiness-stage.mjs'),false);
 assert.doesNotMatch(source,/process\.env|export default|\bfetch\s*\(|\.query\s*\(|\.connect\s*\(|INSERT INTO|UPDATE\s+gallery/i);
});
