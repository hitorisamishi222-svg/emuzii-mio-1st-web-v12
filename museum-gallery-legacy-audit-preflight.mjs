// Unexposed MIO museum release rehearsal: read-only legacy moderation audit.
// This check does NOT authenticate the DB project/branch or establish that
// audit logs are tamper-proof. It detects inconsistent legacy override
// revision counts, including an override deleted while its audit survived.
// Must run on the actual verified gallery DB, never against the gacha DB.
import {approvedGalleryItems} from './gallery-items.js';

const ID=/^[a-z0-9-]{3,70}$/;
const fail=code=>{throw Error('MUSEUM_AUDIT_'+code)};
const number=x=>{
 if(typeof x==='number'&&Number.isSafeInteger(x)&&x>=0)return x;
 if(typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)){
  const n=Number(x);if(Number.isSafeInteger(n))return n;
 }
 fail('COUNT_INVALID');
};
const read=(x,limit)=>{
 if(!x||x.command!=='SELECT'||!Number.isSafeInteger(x.rowCount)||
  x.rowCount<0||x.rowCount>limit||!Array.isArray(x.rows)||
  x.rows.length!==x.rowCount)fail('SELECT_UNVERIFIED');
 return x.rows;
};
const allowed=new Set(['gallery_save','gallery_hide','gallery_show',
 'gallery_delete','gallery_restore']);
const safeIds=()=>{
 if(!Array.isArray(approvedGalleryItems)||approvedGalleryItems.length>500)
  fail('STATIC_ALLOWLIST_INVALID');
 const ids=approvedGalleryItems.map(item=>item?.id);
 if(ids.some(id=>typeof id!=='string'||!ID.test(id))||
    new Set(ids).size!==ids.length)fail('STATIC_ALLOWLIST_INVALID');
 return ids;
};
// Use a checked-out dedicated client belonging to a validated database
// connection. This function opens its own strictly READ ONLY transaction.
export async function inspectMuseumLegacyGalleryAuditStage(client){
 if(!client||typeof client.query!=='function')fail('DEDICATED_CLIENT_REQUIRED');
 const ids=safeIds();
 let begun=false;
 try{
  const start=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(start?.command!=='BEGIN')fail('BEGIN_UNVERIFIED');
  begun=true;
  const overrides=read(await client.query(
   'SELECT item_id,revision FROM gallery_live_overrides '+
   'WHERE item_id=ANY($1::text[]) ORDER BY item_id LIMIT 501',[ids]),500);
  // Never fetch actor IDs, cookies, tokens, submitted messages, or raw history.
  const audit=read(await client.query(
   "SELECT target AS item_id,COUNT(*)::text AS audit_count "+
   "FROM gallery_admin_audit WHERE target=ANY($1::text[]) "+
   "AND result='success' AND action=ANY($2::text[]) "+
   'GROUP BY target ORDER BY target LIMIT 501',
   [ids,[...allowed]]),500);
  const expected=new Set(ids),mod=new Map(),logged=new Map();
  for(const row of overrides){
   if(!row||!expected.has(row.item_id)||mod.has(row.item_id))
    fail('OVERRIDE_ROW_INVALID');
   const revision=number(row.revision);
   if(revision<1)fail('OVERRIDE_REVISION_INVALID');
   mod.set(row.item_id,revision);
  }
  for(const row of audit){
   if(!row||!expected.has(row.item_id)||logged.has(row.item_id))
    fail('AUDIT_ROW_INVALID');
   const count=number(row.audit_count);
   if(count<1)fail('AUDIT_COUNT_INVALID');
   logged.set(row.item_id,count);
  }
  const mismatched=ids.filter(id=>(mod.get(id)||0)!==(logged.get(id)||0));
  const ended=await client.query('COMMIT');
  if(ended?.command!=='COMMIT')fail('READ_COMMIT_UNVERIFIED');
  begun=false;
  return Object.freeze({
   auditCountsConsistent:mismatched.length===0,
   checkedWorks:ids.length,
   versionsWithHistory:logged.size,
   mismatchCount:mismatched.length,
   // This report alone can NEVER authorize deployment or claim a good backup.
   identityVerified:false,backupVerified:false,canDeploy:false,
   didModifyProduction:false
  });
 }catch(err){
  if(begun){
   try{await client.query('ROLLBACK')}catch{fail('ROLLBACK_UNVERIFIED')}
  }
  // Never return raw PG errors that can contain hostnames or credential strings.
  if(err?.message?.startsWith('MUSEUM_AUDIT_'))throw err;
  fail('READ_FAILED');
 }
}
