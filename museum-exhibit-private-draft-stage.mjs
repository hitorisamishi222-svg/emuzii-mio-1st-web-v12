// MIO museum UNROUTED stage-only private exhibit create/edit contract.
// It has no API, pool, secrets or permissions of its own. New tables are
// UNAPPLIED. Future caller must verify the exact isolated DB, schema, restore
// drill, existing owner device/session and approval before invoking it.
// Never upload media, change publication, import participant or gacha data.
import {createHash} from 'node:crypto';

const OP=/^[a-f0-9]{32}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const KINDS=new Set(['gallery','icons','moments','events']);
const CATEGORIES=new Set(['イラスト','動画','音声・楽曲','ファンアート','その他']);
const FIELDS='category,credit,description,externalUrl,imageUrl,kind,occurredOn,title';
const fail=x=>{throw Error('MUSEUM_EXHIBIT_'+x)};
const asRevision=x=>{
 const n=typeof x==='string'&&/^(0|[1-9]\d*)$/.test(x)?Number(x):x;
 if(!Number.isSafeInteger(n)||n<0||n>2147483647)fail('REVISION_INVALID');
 return n;
};
const rows=(result,n)=>{
 if(!result||result.command!=='SELECT'&&result.command!=='INSERT'&&
    result.command!=='UPDATE'||result.rowCount!==n||
    !Array.isArray(result.rows)||result.rows.length!==n)fail('DATABASE_RESULT_UNVERIFIED');
 return result.rows;
};
const string=(x,max)=>typeof x==='string'&&x.length<=max&&!CONTROL.test(x);
const https=x=>{
 if(x==='')return true;
 if(!string(x,2048))return false;
 try{
  const u=new URL(x);
  return u.protocol==='https:'&&u.hostname.length>0&&
   !u.username&&!u.password&&!u.hash&&
   !/[\u0000-\u0020\u007f]/.test(x);
 }catch{return false}
};
const image=x=>x===''||
 /^\/assets\/[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(x)&&!x.includes('..')||
 typeof x==='string'&&/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(x)&&!x.includes('..');
const isoDate=x=>{
 if(x===null)return true;
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const date=new Date(x+'T00:00:00.000Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===x;
};
const normalize=draft=>{
 if(!draft||typeof draft!=='object'||Array.isArray(draft)||
    Object.keys(draft).sort().join(',')!==FIELDS)fail('DRAFT_FIELDS_INVALID');
 if(!KINDS.has(draft.kind)||!CATEGORIES.has(draft.category)||
    !string(draft.title,120)||!draft.title.trim()||
    !string(draft.description,2000)||!string(draft.credit,80)||
    !isoDate(draft.occurredOn)||!string(draft.imageUrl,1024)||
    !image(draft.imageUrl)||!https(draft.externalUrl))fail('DRAFT_CONTENT_INVALID');
 return Object.freeze({
  kind:draft.kind,category:draft.category,title:draft.title.trim(),description:draft.description,
  credit:draft.credit.trim(),occurredOn:draft.occurredOn,
  imageUrl:draft.imageUrl,externalUrl:draft.externalUrl
 });
};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

export async function saveMuseumExhibitPrivateDraftStage(client,{
 request,operationId,action,draft,exhibitId=null,expectedRevision=null,
 verifyOwner
}={}){
 if(!client||typeof client.query!=='function')fail('DEDICATED_CLIENT_REQUIRED');
 if(typeof verifyOwner!=='function')fail('OWNER_VERIFIER_REQUIRED');
 if(typeof operationId!=='string'||!OP.test(operationId))fail('OPERATION_ID_INVALID');
 if(action!=='create'&&action!=='edit')fail('ACTION_INVALID');
 if(action==='create'&&(exhibitId!==null||expectedRevision!==null))fail('CREATE_ARGUMENT_INVALID');
 if(action==='edit'&&(!UUID.test(exhibitId||'')||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
    expectedRevision>=2147483647))fail('EDIT_ARGUMENT_INVALID');
 const fields=normalize(draft);
 let active=false,commitAttempted=false;
 try{
  const begun=await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  if(begun?.command!=='BEGIN')fail('BEGIN_UNVERIFIED');
  active=true;
  const owner=await verifyOwner(client,request);
  if(!owner||owner.role!=='owner'||typeof owner.user_id!=='string'||
     !UUID.test(owner.user_id))fail('OWNER_AUTH_REQUIRED');
  const actor=owner.user_id.toLowerCase();
  const payloadHash=digest({actor,action,exhibitId:action==='edit'?exhibitId.toLowerCase():null,
   expectedRevision:action==='edit'?expectedRevision:null,fields});
  const prior=await client.query(
   'SELECT actor_id,action,payload_hash,exhibit_id,revision FROM museum_exhibit_draft_operations_stage WHERE operation_id=$1',
   [operationId]);
  if(!prior||prior.command!=='SELECT'||![0,1].includes(prior.rowCount)||
     !Array.isArray(prior.rows)||prior.rows.length!==prior.rowCount)
   fail('RECEIPT_READ_UNVERIFIED');
  if(prior.rowCount===1){
   const a=prior.rows[0];
   if(a?.actor_id?.toLowerCase()!==actor||a.action!==action||
      a.payload_hash!==payloadHash||!UUID.test(a.exhibit_id||''))
    fail('OPERATION_CONFLICT');
   const revision=asRevision(a.revision);
   commitAttempted=true;
   const done=await client.query('COMMIT');
   if(done?.command!=='COMMIT')fail('COMMIT_UNCONFIRMED');
   active=false;
   // This acknowledges a historical private save; a later publication or
   // takedown is NOT undone by an idempotent replay.
   return Object.freeze({ok:true,replayed:true,exhibitId:a.exhibit_id.toLowerCase(),
    revision,privateDraftAtSave:true,published:false});
  }
  const args=[fields.kind,fields.category,fields.title,fields.description,fields.credit,
   fields.occurredOn,fields.imageUrl,fields.externalUrl];
  let result;
  if(action==='create'){
   result=await client.query(
    "INSERT INTO museum_public_exhibits(kind,category,title,description,credit,occurred_on,image_url,external_url,status,revision) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft',0) RETURNING id,revision,status",
    args);
  }else{
   result=await client.query(
    "UPDATE museum_public_exhibits SET kind=$1,category=$2,title=$3,description=$4,credit=$5,"+
    "occurred_on=$6,image_url=$7,external_url=$8,revision=revision+1,"+
    "rights_checked_at=NULL,privacy_checked_at=NULL,reviewed_by=NULL,published_at=NULL,"+
    "updated_at=now() WHERE id=$9 AND revision=$10 AND status='draft' "+
    "RETURNING id,revision,status",
    [...args,exhibitId.toLowerCase(),expectedRevision]);
  }
  if(!result||result.rowCount===0&&action==='edit')fail('REVISION_OR_STATE_CONFLICT');
  const data=rows(result,1)[0];
  if(!UUID.test(data?.id||'')||data.status!=='draft')fail('PRIVATE_WRITE_UNVERIFIED');
  const revision=asRevision(data.revision);
  if(action==='create'&&revision!==0||action==='edit'&&
     (data.id.toLowerCase()!==exhibitId.toLowerCase()||
      revision!==expectedRevision+1))fail('PRIVATE_WRITE_UNVERIFIED');
  const wrote=await client.query(
   "INSERT INTO museum_exhibit_draft_operations_stage(operation_id,actor_id,exhibit_id,action,payload_hash,revision) "+
   "VALUES($1,$2,$3,$4,$5,$6) RETURNING operation_id",
   [operationId,actor,data.id.toLowerCase(),action,payloadHash,revision]);
  if(rows(wrote,1)[0]?.operation_id!==operationId)fail('RECEIPT_WRITE_UNVERIFIED');
  commitAttempted=true;
  const committed=await client.query('COMMIT');
  if(committed?.command!=='COMMIT')fail('COMMIT_UNCONFIRMED');
  active=false;
  return Object.freeze({ok:true,replayed:false,exhibitId:data.id.toLowerCase(),
   revision,privateDraftAtSave:true,published:false});
 }catch(error){
  if(active&&!commitAttempted){
   try{const rolled=await client.query('ROLLBACK');if(rolled?.command!=='ROLLBACK')
    fail('ROLLBACK_UNCONFIRMED');}catch{fail('ROLLBACK_UNCONFIRMED')}
  }
  if(commitAttempted)fail('COMMIT_UNCONFIRMED');
  // Database driver errors may include connection details or statement data.
  if(error instanceof Error&&error.message.startsWith('MUSEUM_EXHIBIT_'))throw error;
  fail('QUERY_FAILED');
 }
}
