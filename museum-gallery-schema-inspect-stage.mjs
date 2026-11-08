// UNROUTED MIO museum schema introspection adapter (READ ONLY).
// No client, pool, credentials, target branch or backup is created here.
// The caller must supply a dedicated existing checked-out PG client and
// independent provider evidence that identifies the actual project/branch.
// The PostgreSQL database name alone does NOT identify a Neon branch.
import {museumGalleryReleaseSchemaReport} from './museum-gallery-release-schema-stage.mjs';

const error=code=>{throw Error('MUSEUM_INSPECT_'+code)};
const inspected=(x,max)=>{
 if(!x||x.command!=='SELECT'||!Number.isSafeInteger(x.rowCount)||
    x.rowCount<0||x.rowCount>max||!Array.isArray(x.rows)||
    x.rows.length!==x.rowCount)error('DATABASE_RESPONSE_UNVERIFIED');
 return x.rows;
};
export async function inspectMuseumGallerySchemaStage(client,{
 expectedDatabaseName,independentBranchVerified=false
}={}){
 if(!client||typeof client.query!=='function')error('DEDICATED_CLIENT_REQUIRED');
 if(typeof expectedDatabaseName!=='string'||!(/^[a-zA-Z0-9_]{1,63}$/).test(expectedDatabaseName))
  error('DATABASE_NAME_INVALID');
 let begun=false;
 try{
  const opened=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(opened?.command!=='BEGIN')error('BEGIN_UNVERIFIED');
  begun=true;
  const database=inspected(await client.query(
   'SELECT current_database() AS database_name',[]),1);
  if(database.length!==1||typeof database[0].database_name!=='string')
   error('DATABASE_IDENTITY_UNVERIFIED');
  // Query exact public schema metadata, never content or user records.
  const columns=inspected(await client.query(
   "SELECT table_name,column_name,data_type,is_nullable "+
   "FROM information_schema.columns WHERE table_schema='public' "+
   "ORDER BY table_name,ordinal_position LIMIT 4001",[]),4000);
  const constraints=inspected(await client.query(
   "SELECT t.relname AS table_name,c.contype,c.convalidated AS validated,"+
   "pg_get_constraintdef(c.oid) AS definition "+
   "FROM pg_catalog.pg_constraint c "+
   "JOIN pg_catalog.pg_class t ON t.oid=c.conrelid "+
   "JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace "+
   "WHERE n.nspname='public' ORDER BY t.relname,c.conname LIMIT 4001",[]),4000);
  const report=museumGalleryReleaseSchemaReport({
   columns,constraints,
   identityVerified:database[0].database_name===expectedDatabaseName&&
    independentBranchVerified===true
  });
  const done=await client.query('COMMIT');
  if(done?.command!=='COMMIT')error('READ_COMMIT_UNCONFIRMED');
  begun=false;
  return Object.freeze({
   identityVerified:report.identityVerified,
   sourceReady:report.sourceReady,
   layoutReady:report.layoutReady,
   schemaReady:report.baseMuseumReady&&report.sourceReady&&
    report.roomKindReady&&report.mediaCategoryReady&&
    report.reviewChronologyReady&&report.layoutReady&&report.exhibitReceiptReady,
   exhibitReceiptReady:report.exhibitReceiptReady,
   allReady:report.allReady,
   // Backup, owner signoff, GAS and client source identity are still separate.
   backupVerified:false,ownerApproved:false,
   canPublish:false,canDeploy:false
  });
 }catch(cause){
  if(begun){try{await client.query('ROLLBACK')}catch{error('ROLLBACK_UNCONFIRMED')}}
  // SQL exceptions may include secrets or hostnames. Never return raw
  // driver error content to a browser or caller log.
  if(cause?.message?.startsWith('MUSEUM_INSPECT_'))throw cause;
  error('QUERY_FAILED');
 }
}
