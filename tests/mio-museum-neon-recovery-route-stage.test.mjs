import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessMuseumNeonRecoveryRouteStage as check} from '../museum-neon-recovery-route-stage.mjs';

const PROJECT='dry-feather-67791501';
const ISOLATED='br-bold-credit-b7y6frdo';
const MAIN='br-winter-forest-b7eq6rpz';
const fixture=()=>({
 project:{id:PROJECT,history_retention_seconds:21600,
  owner:{subscription_type:'free_v3'}},
 isolatedBranch:{id:ISOLATED,project_id:PROJECT,parent_id:MAIN,
  name:'gallery-admin-isolated',primary:false,current_state:'ready'},
 productionBranch:{id:MAIN,project_id:PROJECT,name:'main',primary:true,
  current_state:'ready'},
 snapshots:[]
});
const denied=x=>{
 for(const key of ['restorationDrillVerified','isolatedRestoreBranchVerified',
  'restoredSchemaCompared','restoredDataIntegrityCompared','canMigrate',
  'canWrite','canPublish','canDeploy','didQueryDb','didCreateSnapshot',
  'didCreateBranch','didRestore','didMutateProvider']){
  assert.equal(x[key],false,key);
 }
};

test('an independently inventoried six-hour free PITR window is not a successful restore',()=>{
 const x=check(fixture());
 assert.equal(x.identityMatched,true);
 assert.equal(x.route,'pitr_candidate');
 assert.equal(x.historyRetentionSeconds,21600);
 assert.equal(x.pitrWindowAvailable,true);
 assert.equal(x.snapshotCandidate,false);
 denied(x);
 assert.equal(Object.isFrozen(x),true);
});
test('a snapshot is a candidate, never verified backup restoration',()=>{
 const input=fixture();
 input.snapshots=[{id:'snapshot-example-01',branch_id:ISOLATED}];
 const x=check(input);
 assert.equal(x.route,'snapshot_candidate');
 assert.equal(x.snapshotCandidate,true);
 denied(x);
});
test('restoration and integrity booleans smuggled through metadata are ignored',()=>{
 const input=fixture();
 input.project.restorationDrillVerified=true;
 input.project.canWrite=true;
 input.isolatedBranch.restoredDataIntegrityCompared=true;
 const result=check(input);
 assert.equal(result.restorationDrillVerified,false);
 assert.equal(result.canWrite,false);
 denied(result);
});
test('wrong project, production branch, unavailable branch and zero history are not recovery evidence',()=>{
 const mutate=[
  x=>{x.project.id='dry-different-project'},
  x=>{x.isolatedBranch.project_id='dry-unrelated'},
  x=>{x.isolatedBranch.id=MAIN},
  x=>{x.isolatedBranch.primary=true},
  x=>{x.productionBranch.primary=false},
  x=>{x.isolatedBranch.parent_id='br-other'},
  x=>{x.isolatedBranch.name='main'},
  x=>{x.isolatedBranch.current_state='suspended'}
 ];
 for(const apply of mutate){
  const input=fixture();apply(input);
  const x=check(input);
  assert.equal(x.route,'none');
  assert.equal(x.pitrWindowAvailable,false);
  denied(x);
 }
 for(const seconds of [0,-1,3599,Infinity,NaN,'21600',null,60*60*24*31]){
  const input=fixture();input.project.history_retention_seconds=seconds;
  const x=check(input);
  assert.equal(x.pitrWindowAvailable,false,String(seconds));
  assert.equal(x.route,'none',String(seconds));
  denied(x);
 }
});
test('unrelated snapshots cannot authorize a PITR-unavailable branch',()=>{
 const input=fixture();input.project.history_retention_seconds=0;
 input.snapshots=[{id:'snapshot-main-01',branch_id:MAIN}];
 const x=check(input);
 assert.equal(x.snapshotCandidate,false);
 assert.equal(x.route,'none');
 denied(x);
});
test('malformed metadata is rejected without mutation',()=>{
 for(const bad of [{},null,[],{project:{},isolatedBranch:null,productionBranch:{},snapshots:[]}]){
  assert.throws(()=>check(bad??undefined),/MUSEUM_RECOVERY_/);
 }
});
test('recovery inventory is not exposed as a Vercel handler and never touches provider',()=>{
 const source=readFileSync(new URL('../museum-neon-recovery-route-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(source,/process\.env|export default|fetch\s*\(|new Pool|\.query\s*\(|create_snapshot\s*\(/);
 assert.equal(config.routes.some(x=>x.dest==='/museum-neon-recovery-route-stage.mjs'),false);
 assert.equal(config.builds.some(x=>x.src==='museum-neon-recovery-route-stage.mjs'),false);
});
