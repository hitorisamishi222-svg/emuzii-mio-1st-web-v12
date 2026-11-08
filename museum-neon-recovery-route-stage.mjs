// MIO museum recovery-route inventory. READ-ONLY metadata, never backup proof.
// Free Neon projects may have PITR even when there is no paid snapshot.
// A PITR history window is NOT a successful restored-branch drill; this
// module NEVER authorizes DB writes, DDL, production publication, or promotion.
const recognizedId=/^[a-z0-9-]{6,90}$/;
const frozen=Object.freeze;
const fail=code=>{throw Error('MUSEUM_RECOVERY_'+code)};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function assessMuseumNeonRecoveryRouteStage({
 project,isolatedBranch,productionBranch,snapshots=[]
}={}){
 if(!plain(project)||!plain(isolatedBranch)||!plain(productionBranch)||
    !Array.isArray(snapshots)||snapshots.length>2000)fail('METADATA_INVALID');
 if(!recognizedId.test(project.id||'')||
    !recognizedId.test(isolatedBranch.id||'')||
    !recognizedId.test(productionBranch.id||''))fail('IDENTITY_INVALID');
 const correctIsolated=isolatedBranch.project_id===project.id&&
  productionBranch.project_id===project.id&&
  isolatedBranch.id!==productionBranch.id&&
  isolatedBranch.parent_id===productionBranch.id&&
  isolatedBranch.primary===false&&productionBranch.primary===true&&
  isolatedBranch.name==='gallery-admin-isolated'&&
  isolatedBranch.current_state==='ready';
 // Neon project metadata: retained seconds are a possible recovery WINDOW,
 // not evidence that this source state was successfully restored.
 const seconds=project.history_retention_seconds;
 const historyWindowPresent=correctIsolated&&
  Number.isSafeInteger(seconds)&&seconds>=3600&&seconds<=60*60*24*30;
 // A CHILD branch can be inspected at a historical timestamp, but Neon's
 // Instant Restore to an earlier state is root-only. Our currently connected
 // create_branch operation copies HEAD and cannot select parent_timestamp.
 // Never mislabel a retention window as an executable restore route.
 const rootInstantRestoreEligible=false; // isolatedBranch.primary must be false
 const pitrWindowAvailable=historyWindowPresent&&rootInstantRestoreEligible;
 // Snapshot inventory is informational only: creation != restore evidence.
 const snapshotCandidate=correctIsolated&&snapshots.some(x=>
  plain(x)&&typeof x.id==='string'&&recognizedId.test(x.id)&&
  x.branch_id===isolatedBranch.id);
 const route=correctIsolated?
  (snapshotCandidate?'snapshot_candidate':
   historyWindowPresent?'historical_inspection_only':'none'):'none';
 return frozen({
  identityMatched:correctIsolated,
  route,pitrWindowAvailable,historyWindowPresent,
  historyRetentionSeconds:historyWindowPresent?seconds:null,
  rootInstantRestoreEligible,
  timestampBranchCreationAvailableThroughConnector:false,
  snapshotCandidate,
  // These must only come from a future independent, completed restore drill
  // and read-only schema/integrity comparison on a separate restore branch.
  restorationDrillVerified:false,isolatedRestoreBranchVerified:false,
  restoredSchemaCompared:false,restoredDataIntegrityCompared:false,
  // NEVER consume self-asserted restore booleans as authorization.
  canMigrate:false,canWrite:false,canPublish:false,canDeploy:false,
  didQueryDb:false,didCreateSnapshot:false,didCreateBranch:false,
  didRestore:false,didMutateProvider:false
 });
}
