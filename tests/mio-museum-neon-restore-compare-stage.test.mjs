import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareMuseumRestoredBranchStage as compare} from '../museum-neon-restore-compare-stage.mjs';
const PROJECT='dry-feather-67791501';
const MAIN={id:'br-winter-forest-b7eq6rpz',project_id:PROJECT,primary:true};
const SOURCE={id:'br-bold-credit-b7y6frdo',project_id:PROJECT,primary:false};
const RESTORED={id:'br-restore-demo-b7v6qxyz',project_id:PROJECT,primary:false,current_state:'ready'};
const TABLES=[
 'anniversary_announcements','gallery_admin_audit',
 'gallery_admin_challenges','gallery_admin_device_requests',
 'gallery_admin_devices','gallery_admin_owner_invites',
 'gallery_admin_passkeys','gallery_admin_sessions',
 'gallery_admin_users','gallery_live_overrides',
 'gallery_published_items','mio_gacha_admin_challenges',
 'mio_gacha_admin_credentials','mio_gacha_admin_sessions'
];
const response=(records)=>({command:'SELECT',rowCount:records.length,rows:records});
const setup=(options={})=>{
 const calls=[];
 const fixture={
  tables:options.tables||TABLES,
  database:options.database||'neondb',
  counts:options.counts||{},
  columns:options.columns||[{table_name:'gallery_admin_users',
   column_name:'id',data_type:'uuid',is_nullable:'NO'}],
  constraints:options.constraints||[{table_name:'gallery_admin_users',
   contype:'p',validated:true,definition:'PRIMARY KEY (id)'}],
  failAt:options.failAt,
  invalidCount:options.invalidCount,
  invalidTableNames:options.invalidTableNames,
  badBegin:options.badBegin,
  badCommit:options.badCommit
 };
 const obj={
  calls,rollbacks:0,
  async query(sql,args=[]){
   calls.push({sql,args});
   if(fixture.failAt===calls.length)
    throw Error('postgres://username:secret@private-host-never-return');
   if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    return {command:fixture.badBegin?'WRONG':'BEGIN'};
   if(sql==='ROLLBACK'){this.rollbacks++;return {command:'ROLLBACK'};}
   if(sql==='COMMIT')return {command:fixture.badCommit?'WRONG':'COMMIT'};
   if(sql==='SELECT current_database() AS database_name')
    return response([{database_name:fixture.database}]);
   if(sql.includes("information_schema.tables"))
    return response(fixture.invalidTableNames||fixture.tables.map(table_name=>({table_name})));
   if(sql.includes("information_schema.columns"))
    return response(fixture.columns);
   if(sql.includes("pg_catalog.pg_constraint"))
    return response(fixture.constraints);
   if(sql.startsWith('SELECT count(*)::text AS count FROM public.')){
    const table=sql.slice('SELECT count(*)::text AS count FROM public.'.length);
    assert.ok(TABLES.includes(table),'only source-controlled table identifiers');
    return response([{count:fixture.invalidCount&&table==='gallery_admin_users'?
     fixture.invalidCount:fixture.counts[table]??'0'}]);
   }
   throw Error('unexpected SQL '+sql);
  }
 };
 return obj;
};
const run=(s,r,changes={})=>compare({
 sourceClient:s,restoredClient:r,projectId:PROJECT,
 productionBranch:MAIN,sourceBranch:SOURCE,restoredBranch:RESTORED,
 ...changes
});
test('compares full schema and 14 historical table counts on two distinct READ ONLY clients',async()=>{
 const s=setup(),r=setup();
 const result=await run(s,r);
 for(const name of [
  'databaseNamesMatch','sourceLegacyTablesPresent',
  'restoredLegacyTablesPresent','tableInventoryMatches',
  'schemaColumnsMatch','constraintsMatch','rowCountTotalsMatch'
 ])assert.equal(result[name],true,name);
 for(const name of [
  'restorationProvenanceVerified','fullDataIntegrityVerified',
  'restorationDrillVerified','canConnect','canMigrate','canWrite',
  'canPublish','canDeploy','didReadRecordValues','didMutateProvider'
 ])assert.equal(result[name],false,name);
 assert.equal(result.queriedReadOnly,true);
 assert.equal(Object.isFrozen(result),true);
 for(const client of [s,r]){
  assert.equal(client.calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(client.calls.at(-1).sql,'COMMIT');
  assert.equal(client.calls.length,20);
  assert.equal(client.rollbacks,0);
  assert.ok(client.calls.every(x=>!/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(x.sql)));
  assert.ok(client.calls.every(x=>x.args.length===0));
 }
 assert.equal(JSON.stringify(result).includes('username'),false);
});
test('changed row counts never leak private values or numeric counts',async()=>{
 const s=setup({counts:{gallery_admin_users:'17'}}),r=setup({counts:{gallery_admin_users:'16'}});
 const result=await run(s,r);
 assert.equal(result.rowCountTotalsMatch,false);
 assert.equal(JSON.stringify(result).includes('17'),false);
 assert.equal(JSON.stringify(result).includes('16'),false);
 assert.equal(result.fullDataIntegrityVerified,false);
});
test('missing tables, column changes and constraint changes are independently flagged',async()=>{
 const base=setup();
 const other=setup({
  tables:TABLES.filter(x=>x!=='gallery_admin_sessions'),
  columns:[{table_name:'gallery_admin_users',column_name:'id',
   data_type:'text',is_nullable:'NO'}],
  constraints:[{table_name:'gallery_admin_users',
   contype:'p',validated:true,definition:'PRIMARY KEY (other_id)'}]
 });
 const result=await run(base,other);
 assert.equal(result.tableInventoryMatches,false);
 assert.equal(result.restoredLegacyTablesPresent,false);
 assert.equal(result.schemaColumnsMatch,false);
 assert.equal(result.constraintsMatch,false);
 assert.equal(result.restorationDrillVerified,false);
});
test('same client, same source branch, production-as-restore or wrong project rejected BEFORE SQL',async()=>{
 for(const changes of [
  {restoredBranch:{...RESTORED,id:SOURCE.id}},
  {restoredBranch:{...RESTORED,id:MAIN.id}},
  {restoredBranch:{...RESTORED,primary:true}},
  {restoredBranch:{...RESTORED,current_state:'archived'}},
  {restoredBranch:{...RESTORED,project_id:'dry-unrelated-project'}},
  {sourceBranch:{...SOURCE,primary:true}},
  {productionBranch:{...MAIN,primary:false}},
  {projectId:'dry-other-project'},
  {expectedDatabaseName:'x;drop table users;'}
 ]){
  const s=setup(),r=setup();
  await assert.rejects(()=>run(s,r,changes),/MUSEUM_RESTORE_COMPARE_BRANCH_ISOLATION_REQUIRED/);
  assert.equal(s.calls.length,0);
  assert.equal(r.calls.length,0);
 }
 const same=setup();
 await assert.rejects(()=>run(same,same),/MUSEUM_RESTORE_COMPARE_INDEPENDENT_CLIENTS_REQUIRED/);
 assert.equal(same.calls.length,0);
});
test('incorrect database name yields a failure status without echoing credentials',async()=>{
 const result=await run(setup(),setup({database:'not_neondb'}));
 assert.equal(result.databaseNamesMatch,false);
 assert.equal(result.restorationDrillVerified,false);
});
test('unknown, duplicated or malformed provider table identifiers fail closed with rollback',async()=>{
 for(const invalidTableNames of [
  [{table_name:'bad; DROP TABLE gallery_admin_users;'}],
  [{table_name:'gallery_admin_users'},{table_name:'gallery_admin_users'}],
  [{table_name:null}]
 ]){
  const s=setup({invalidTableNames}),r=setup();
  await assert.rejects(()=>run(s,r),/MUSEUM_RESTORE_COMPARE_TABLE_NAMES_INVALID/);
  assert.equal(s.rollbacks,1);
  assert.equal(r.calls.length,0);
 }
});
test('invalid count, query errors and unacknowledged COMMIT cannot become verified',async()=>{
 for(const options of [
  {invalidCount:'invalid'},
  {failAt:5},
  {badCommit:true}
 ]){
  const s=setup(options),r=setup();
  await assert.rejects(()=>run(s,r),e=>{
   assert.match(e.message,/^MUSEUM_RESTORE_COMPARE_/);
   assert.doesNotMatch(e.message,/username|secret|private-host/);
   return true;
  });
  assert.equal(s.rollbacks,1);
  assert.equal(r.calls.length,0);
 }
 const s=setup({badBegin:true}),r=setup();
 await assert.rejects(()=>run(s,r),/MUSEUM_RESTORE_COMPARE_BEGIN_INVALID/);
 assert.equal(s.calls.length,1);
});
test('source code has no credential access, API route, provider writes or dynamic SQL identifiers',()=>{
 const file=readFileSync(new URL('../museum-neon-restore-compare-stage.mjs',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.doesNotMatch(file,/process\.env|export default|new Pool|fetch\s*\(|get_connection_string|create_branch\s*\(|restore_snapshot\s*\(/);
 assert.equal(config.routes.some(x=>x.dest==='/museum-neon-restore-compare-stage.mjs'),false);
 assert.equal(config.builds.some(x=>x.src==='museum-neon-restore-compare-stage.mjs'),false);
});
