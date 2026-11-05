// MIO museum: DRAFT ONLY, provider-inventory diagnostics without DB access.
// Inputs are sanitized metadata obtained independently by the operator.
// This does NOT verify their provenance, restore backups or grant any action.
// Never serialize credentials, environment variable values or participant rows.
import {assessMuseumPreviewEnvScopeStage} from './museum-vercel-preview-env-scope-stage.mjs';

const TABLES=Object.freeze([
 'gallery_admin_users','gallery_admin_devices','gallery_admin_sessions',
 'gallery_live_overrides',
 'museum_public_exhibits','museum_gallery_layout_stage',
 'museum_gallery_layout_history_stage','museum_gallery_layout_audit_stage'
]);
const PREFIX='MUSEUM_INVENTORY_';
const fail=x=>{throw Error(PREFIX+x)};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safeList=(a,n)=>Array.isArray(a)&&a.length<=n;
const NAME=/^[a-z][a-z0-9_]{0,62}$/;
const IDENT=/^[a-z0-9-]{6,90}$/;
const freeze=Object.freeze;

export function assessMuseumProviderReadinessStage({
 previewVariables,deployment,expected,neonBranches,neonDatabases,
 neonTables,neonSnapshots
}={}){
 if(!record(expected)||!safeList(neonBranches,300)||
    !safeList(neonDatabases,300)||!safeList(neonTables,2000)||
    !safeList(neonSnapshots,2000))fail('METADATA_INVALID');
 // Never accept arbitrary branch names or partial identifiers as evidence.
 const spec=expected;
 const validIds=[spec.neonProjectId,spec.galleryBranchId,
  spec.productionBranchId].every(v=>typeof v==='string'&&IDENT.test(v));
 const branch=validIds?neonBranches.find(x=>
  record(x)&&x.id===spec.galleryBranchId):null;
 const main=validIds?neonBranches.find(x=>
  record(x)&&x.id===spec.productionBranchId):null;
 const preview=assessMuseumPreviewEnvScopeStage({
  variables:previewVariables,deployment,
  expected:{vercelProjectId:spec.vercelProjectId,candidateSha:spec.candidateSha}
 });
 const database=typeof spec.databaseName==='string'&&NAME.test(spec.databaseName)&&
  neonDatabases.some(x=>record(x)&&x.name===spec.databaseName);
 const tableNames=neonTables.map(x=>typeof x==='string'?x:record(x)?
  x.table_name??x.name:null);
 const tableShape=tableNames.every(x=>typeof x==='string'&&NAME.test(x))&&
  new Set(tableNames).size===tableNames.length;
 const missing=TABLES.filter(t=>!tableNames.includes(t));
 const checks=freeze({
  preview_environment_isolated:preview.metadataConsistent,
  neon_gallery_branch_isolated:!!branch&&!!main&&branch.primary===false&&
   main.primary===true&&branch.id!==main.id&&
   branch.parent_id===main.id&&branch.name==='gallery-admin-isolated',
  neon_database_present:database,
  schema_table_inventory_complete:tableShape&&missing.length===0,
  // A snapshot record is not a completed restore exercise.
  snapshot_inventory_present:neonSnapshots.some(x=>
   record(x)&&x.branch_id===spec.galleryBranchId&&
   typeof x.id==='string'&&x.id.length>0)
 });
 const blockers=freeze(Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key));
 return freeze({
  checks,
  blockers,
  missingTables:freeze(missing),
  // This is only the provider metadata inventory. A later READ-ONLY PG
  // inspection must prove actual constraints and user/session revocations.
  metadataInventoryComplete:blockers.length===0,
  restorationDrillVerified:false,
  actualConnectionBindingVerified:false,
  ownerAuthorizationVerified:false,
  canConnect:false,canMigrate:false,canWrite:false,canDeploy:false,
  didQueryDb:false,didReadSecrets:false,didChangeProvider:false
 });
}
export const requiredMuseumProviderTables=TABLES;
