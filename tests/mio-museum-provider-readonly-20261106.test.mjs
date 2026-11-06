import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessMuseumProviderReadinessStage} from '../museum-provider-readiness-stage.mjs';
const observation=JSON.parse(readFileSync(new URL('./fixtures/mio-museum-provider-readonly-20261106.json',import.meta.url),'utf8'));
const BRANCH='feature/mio-v2-integration-mainbaseline-20261102';
const fixture=()=>({
 previewVariables:observation.vercel.legacyGalleryEnvScopes.map((x,index)=>({
  id:'legacy-'+index,key:'GALLERY_DATABASE_URL',type:'encrypted',
  target:x.target,...(x.gitBranch?{gitBranch:x.gitBranch}:{})
 })),
 deployment:{projectId:'prj_OfflineMuseumReadOnly',target:'preview',gitBranch:BRANCH,gitSha:'a'.repeat(40)},
 expected:{vercelProjectId:'prj_OfflineMuseumReadOnly',candidateSha:'a'.repeat(40),
  neonProjectId:'museum-project-test',galleryBranchId:'museum-gallery-test',productionBranchId:'museum-main-test',databaseName:'neondb'},
 neonBranches:[
  {id:'museum-main-test',project_id:'museum-project-test',name:'main',primary:true},
  {id:'museum-gallery-test',project_id:'museum-project-test',name:observation.neon.isolatedBranch,
   primary:false,parent_id:'museum-main-test',current_state:'ready'}
 ],
 neonDatabases:[{name:observation.neon.database}],
 neonTables:observation.neon.existingTables.map(table_name=>({table_name})),
 neonSnapshots:[],
 neonProjectMetadata:{id:'museum-project-test',history_retention_seconds:observation.neon.historyRetentionSeconds}
});
test('2026-11-06 read-only observation captures only schema names and env scopes, never secrets or user data',()=>{
 assert.equal(observation.schema,'mio-museum-provider-inventory-observation-v1');
 assert.equal(observation.observedOn,'2026-11-06');
 assert.equal(observation.neon.existingTables.length,14);
 assert.equal(new Set(observation.neon.existingTables).size,14);
 assert.equal(observation.neon.totalBranches,6);
 assert.equal(observation.neon.activeBranches,2);
 assert.equal(observation.neon.archivedBranches,4);
 assert.equal(observation.neon.snapshotCount,0);
 assert.equal(observation.vercel.museumDedicatedEnvMatches,0);
 for(const key of ['secretValuesRead','privateDataRowsRead','databaseWrites','providerMutations'])
  assert.equal(observation[key],false,key);
 const raw=JSON.stringify(observation);
 assert.doesNotMatch(raw,/postgres(?:ql)?:\/\/|password=|token_hash|client_secret|authorization\s*:/i);
 assert.deepEqual(observation.neon.existingTables.filter(x=>x.startsWith('museum_')),[]);
});
test('verified metadata remains BLOCKED: five museum tables, dedicated Preview key and restorable backup missing',()=>{
 const report=assessMuseumProviderReadinessStage(fixture());
 assert.deepEqual(report.missingTables,observation.expectedMissingMuseumTables);
 assert.deepEqual(report.blockers,[
  'preview_environment_isolated','schema_table_inventory_complete','recovery_route_inventory_present'
 ]);
 assert.equal(report.checks.neon_gallery_branch_isolated,true);
 assert.equal(report.checks.neon_database_present,true);
 assert.equal(report.historyRetentionSeconds,21600);
 assert.equal(report.recoveryRoute,'historical_inspection_only');
 assert.equal(report.metadataInventoryComplete,false);
 for(const key of ['canConnect','canMigrate','canWrite','canDeploy','restorationDrillVerified',
  'actualConnectionBindingVerified','ownerAuthorizationVerified','didChangeProvider','didReadSecrets'])
  assert.equal(report[key],false,key);
});
test('readiness cannot be mistaken for restored backup even with a scoped key and added table names',()=>{
 const v=fixture();
 v.previewVariables=[{key:'MIO_MUSEUM_GALLERY_DATABASE_URL',id:'mock-owner-only',
  type:'encrypted',target:['preview'],gitBranch:BRANCH}];
 v.neonTables.push(...observation.expectedMissingMuseumTables.map(table_name=>({table_name})));
 v.neonSnapshots=[{id:'mock-snapshot',branch_id:'museum-gallery-test'}];
 const r=assessMuseumProviderReadinessStage(v);
 assert.equal(r.metadataInventoryComplete,true);
 assert.equal(r.restorationDrillVerified,false);
 assert.equal(r.ownerAuthorizationVerified,false);
 assert.equal(r.actualConnectionBindingVerified,false);
 assert.equal(r.canWrite,false);
 assert.equal(r.canMigrate,false);
 assert.equal(r.canDeploy,false);
});
