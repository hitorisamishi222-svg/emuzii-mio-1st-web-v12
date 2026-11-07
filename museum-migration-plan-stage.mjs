// MIO museum migration-bundle verification, unmounted and READ-ONLY.
// Records only schema/table names and Git blob SHA1 digests. No credentials,
// database client, network request, or SQL execution is possible here.
// A matching source is NOT restoration proof or permission to run the SQL.
import {createHash} from 'node:crypto';

const BUNDLE=Object.freeze([
 Object.freeze({path:'db/museum-public-exhibits.sql',blob:'96a45e89e86e93d4d020aefcbf9690b84a17422f',
  declares:['museum_public_exhibits']}),
 Object.freeze({path:'db/museum-gallery-layout-stage.sql',blob:'c125667189ccf32bb9b382eaac5a0869454ff226',
  declares:['museum_gallery_layout_stage','museum_gallery_layout_history_stage','museum_gallery_layout_audit_stage']}),
 Object.freeze({path:'db/museum-exhibit-draft-operations-stage.sql',blob:'90c6e6e21d783b9689b34f52bb5974e2eb98022a',
  declares:['museum_exhibit_draft_operations_stage']})
]);
const REQUIRED_BASE=Object.freeze(['gallery_admin_users','gallery_admin_devices','gallery_admin_sessions',
 'gallery_live_overrides']);
const ID=/^[a-z][a-z0-9_]{0,62}$/;
const sha=/^[a-f0-9]{40}$/;
const fail=code=>{throw Error('MUSEUM_MIGRATION_'+code)};
const blobSha=x=>{
 const bytes=Buffer.from(x,'utf8');
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
};
export const museumMigrationSourceManifestStage=Object.freeze(BUNDLE.map(x=>
 Object.freeze({path:x.path,blobSha:x.blob,declares:Object.freeze([...x.declares])})
));
export const museumMigrationTargetTablesStage=Object.freeze(BUNDLE.flatMap(x=>x.declares));
export const museumMigrationOrderStage=Object.freeze(BUNDLE.map(x=>x.path));

export function assessMuseumMigrationPlanStage({
 candidateFiles,observedTableNames,independentBranchVerified=false,
 previewBindingVerified=false,restorationDrillVerified=false,
 ownerApproved=false
}={}){
 if(!candidateFiles||typeof candidateFiles!=='object'||Array.isArray(candidateFiles)||
  Object.getPrototypeOf(candidateFiles)!==Object.prototype||
  Object.keys(candidateFiles).sort().join('|')!==BUNDLE.map(x=>x.path).sort().join('|')||
  !Array.isArray(observedTableNames)||observedTableNames.length>1000||
  !observedTableNames.every(t=>typeof t==='string'&&ID.test(t))||
  new Set(observedTableNames).size!==observedTableNames.length)
  fail('INPUT_INVALID');
 for(const expected of BUNDLE){
  const contents=candidateFiles[expected.path];
  if(typeof contents!=='string'||contents.length>50000||
   !sha.test(expected.blob)||blobSha(contents)!==expected.blob)
   fail('CANDIDATE_CHANGED');
 }
 const all=new Set(observedTableNames);
 const missingBase=REQUIRED_BASE.filter(x=>!all.has(x));
 const alreadyPresent=museumMigrationTargetTablesStage.filter(x=>all.has(x));
 const absent=museumMigrationTargetTablesStage.filter(x=>!all.has(x));
 // IF NOT EXISTS must never be used to mask an existing wrong schema.
 // If even one target exists, require a fresh independent catalog inspection.
 const checks=Object.freeze({
  candidate_files_exactly_locked:true,
  existing_gallery_dependencies_present:missingBase.length===0,
  candidate_targets_entirely_absent:alreadyPresent.length===0,
  independent_isolated_branch_verified:independentBranchVerified===true,
  preview_binding_verified:previewBindingVerified===true,
  recovery_drill_verified:restorationDrillVerified===true,
  owner_approved:ownerApproved===true
 });
 const blockers=Object.freeze(Object.entries(checks).filter(([,v])=>!v).map(([k])=>k));
 return Object.freeze({
  schemaSourceLocked:true,
  requiredLegacyDependencies:Object.freeze([...REQUIRED_BASE]),
  missingLegacyDependencies:Object.freeze(missingBase),
  missingTargetTables:Object.freeze(absent),
  previouslyExistingTargets:Object.freeze(alreadyPresent),
  candidateOrder:museumMigrationOrderStage,
  checks,blockers,
  // Even with six synthetic true inputs, that is NOT independent proof;
  // a real authenticated migration executor is intentionally absent.
  preflightMetadataComplete:blockers.length===0,
  actualProviderProvenanceVerified:false,
  hasExecutableMigration:false,
  canMigrate:false,canWrite:false,canPublish:false,canDeploy:false,
  didConnect:false,didReadSecrets:false,didExecuteSql:false
 });
}
