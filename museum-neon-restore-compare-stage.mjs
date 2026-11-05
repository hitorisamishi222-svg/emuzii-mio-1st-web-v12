// MIO museum restore rehearsal acceptance *candidate*: UNROUTED, READ-ONLY.
// It never opens a network connection, provisions a branch, deploys or writes.
// Pass checked-out independent clients only AFTER verifying Neon project and
// source/restore branch identities outside this module. It does not validate
// provenance of a time-travel operation and NEVER authorizes DDL or writes.
// Never return row values, row counts, credentials or query errors to callers.
const PREFIX='MUSEUM_RESTORE_COMPARE_';
const fail=code=>{throw Error(PREFIX+code)};
const ident=/^[a-z0-9-]{6,90}$/;
const required=Object.freeze([
 'anniversary_announcements',
 'gallery_admin_audit','gallery_admin_challenges',
 'gallery_admin_device_requests','gallery_admin_devices',
 'gallery_admin_owner_invites','gallery_admin_passkeys',
 'gallery_admin_sessions','gallery_admin_users',
 'gallery_live_overrides','gallery_published_items',
 'mio_gacha_admin_challenges','mio_gacha_admin_credentials',
 'mio_gacha_admin_sessions'
]);
const rows=(result,maximum=4000)=>{
 if(result?.command!=='SELECT'||!Number.isSafeInteger(result.rowCount)||
    result.rowCount<0||result.rowCount>maximum||
    !Array.isArray(result.rows)||result.rows.length!==result.rowCount)
  fail('DB_RESPONSE_INVALID');
 return result.rows;
};
const canonical=records=>JSON.stringify(records.slice()
 .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
const cleanTableName=x=>typeof x==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(x);
const column=x=>({
 table_name:x?.table_name,column_name:x?.column_name,
 data_type:x?.data_type,is_nullable:x?.is_nullable
});
const constraint=x=>({
 table_name:x?.table_name,contype:x?.contype,
 validated:x?.validated,definition:x?.definition
});
const cleanArray=(values,parse)=>values.map(x=>{
 const y=parse(x);
 if(Object.values(y).some(z=>typeof z!=='string'&&typeof z!=='boolean'))
  fail('SCHEMA_ROW_INVALID');
 if(!cleanTableName(y.table_name))fail('SCHEMA_ROW_INVALID');
 return y;
});
async function readSide(client){
 let opened=false;
 try{
  const begin=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(begin?.command!=='BEGIN')fail('BEGIN_INVALID');
  opened=true;
  const database=rows(await client.query(
   'SELECT current_database() AS database_name',[]),1);
  if(database.length!==1||!database[0]||
     typeof database[0].database_name!=='string')fail('DB_IDENTITY_INVALID');
  const tableRows=rows(await client.query(
   "SELECT table_name FROM information_schema.tables "+
   "WHERE table_schema='public' AND table_type='BASE TABLE' "+
   'ORDER BY table_name LIMIT 4001',[]));
  const names=tableRows.map(x=>x?.table_name);
  if(!names.every(cleanTableName)||new Set(names).size!==names.length)
   fail('TABLE_NAMES_INVALID');
  const columns=cleanArray(rows(await client.query(
   'SELECT table_name,column_name,data_type,is_nullable '+
   "FROM information_schema.columns WHERE table_schema='public' "+
   'ORDER BY table_name,ordinal_position LIMIT 4001',[])),column);
  const constraints=cleanArray(rows(await client.query(
   'SELECT t.relname AS table_name,c.contype,c.convalidated AS validated,'+
   'pg_get_constraintdef(c.oid) AS definition '+
   'FROM pg_catalog.pg_constraint c '+
   'JOIN pg_catalog.pg_class t ON t.oid=c.conrelid '+
   'JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace '+
   "WHERE n.nspname='public' ORDER BY t.relname,c.conname LIMIT 4001",[])),constraint);
  // Only exact, source-controlled table identifiers are interpolated.
  // Neither caller nor DB metadata can inject identifiers into SQL.
  const counts=[];
  for(const table of required){
   if(!names.includes(table))continue;
   const result=rows(await client.query(
    'SELECT count(*)::text AS count FROM public.'+table,[]),1);
   if(result.length!==1||!/^(0|[1-9]\d*)$/.test(result[0]?.count||''))
    fail('COUNT_INVALID');
   counts.push([table,result[0].count]);
  }
  const committed=await client.query('COMMIT');
  if(committed?.command!=='COMMIT')fail('READ_COMMIT_UNCONFIRMED');
  opened=false;
  return {database:database[0].database_name,names,
   columns:canonical(columns),constraints:canonical(constraints),counts};
 }catch(error){
  if(opened){
   try{
    if((await client.query('ROLLBACK'))?.command!=='ROLLBACK')
     fail('ROLLBACK_UNCONFIRMED');
   }catch{fail('ROLLBACK_UNCONFIRMED')}
  }
  if(error?.message?.startsWith(PREFIX))throw error;
  // Redact driver exception text, hostnames and SQL parameters.
  fail('QUERY_FAILED');
 }
}
export async function compareMuseumRestoredBranchStage({
 sourceClient,restoredClient,
 projectId,productionBranch,sourceBranch,restoredBranch,
 expectedDatabaseName='neondb'
}={}){
 if(!sourceClient||!restoredClient||sourceClient===restoredClient||
    typeof sourceClient.query!=='function'||typeof restoredClient.query!=='function')
  fail('INDEPENDENT_CLIENTS_REQUIRED');
 const valid=[projectId,productionBranch?.id,sourceBranch?.id,restoredBranch?.id]
  .every(x=>typeof x==='string'&&ident.test(x));
 if(!valid||sourceBranch.id===productionBranch.id||
    restoredBranch.id===sourceBranch.id||restoredBranch.id===productionBranch.id||
    sourceBranch.project_id!==projectId||productionBranch.project_id!==projectId||
    restoredBranch.project_id!==projectId||
    sourceBranch.primary!==false||productionBranch.primary!==true||
    restoredBranch.primary!==false||restoredBranch.current_state!=='ready'||
    !/^[a-zA-Z0-9_]{1,63}$/.test(expectedDatabaseName))
  fail('BRANCH_ISOLATION_REQUIRED');
 // Both transactions use a read-only client; never copy records to logs.
 const source=await readSide(sourceClient);
 const restored=await readSide(restoredClient);
 const databaseNamesMatch=source.database===expectedDatabaseName&&
  restored.database===expectedDatabaseName;
 const missingSource=required.filter(x=>!source.names.includes(x));
 const missingRestored=required.filter(x=>!restored.names.includes(x));
 const tableInventoryMatches=canonical(source.names)===canonical(restored.names);
 const schemaColumnsMatch=source.columns===restored.columns;
 const constraintsMatch=source.constraints===restored.constraints;
 const rowCountTotalsMatch=canonical(source.counts)===canonical(restored.counts);
 return Object.freeze({
  databaseNamesMatch,sourceLegacyTablesPresent:missingSource.length===0,
  restoredLegacyTablesPresent:missingRestored.length===0,
  tableInventoryMatches,schemaColumnsMatch,constraintsMatch,
  rowCountTotalsMatch,
  // A matching structure and counts do not prove byte-identical records
  // or a genuine provider-controlled point-in-time restoration.
  restorationProvenanceVerified:false,
  fullDataIntegrityVerified:false,
  restorationDrillVerified:false,
  canConnect:false,canMigrate:false,canWrite:false,
  canPublish:false,canDeploy:false,
  queriedReadOnly:true,didReadRecordValues:false,didMutateProvider:false
 });
}
