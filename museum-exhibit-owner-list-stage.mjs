// MIO museum UNROUTED owner-only private draft reader.
// Existing isolated branch/tables and backup are NOT deployment-ready.
// No endpoint, DB pool, credentials, media upload or HTTP handler is created.
// Authenticated drafts only; never query registration, attendance or gacha.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOMS=new Set(['gallery','icons','moments','events']);
const CATEGORIES=new Set(['イラスト','動画','音声・楽曲','ファンアート','その他']);
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const fail=x=>{throw Error('MUSEUM_DRAFT_LIST_'+x)};
const validString=(x,n)=>typeof x==='string'&&x.length<=n&&!CONTROL.test(x);
const isoTime=value=>{
 const x=value instanceof Date?value.toISOString():value;
 if(typeof x!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)||
  !Number.isFinite(Date.parse(x))||new Date(x).toISOString()!==x)fail('TIMESTAMP_INVALID');
 return x;
};
const isoDate=value=>{
 if(value===null)return null;
 const s=value instanceof Date?value.toISOString().slice(0,10):value;
 if(typeof s!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(s))fail('DATE_INVALID');
 const date=new Date(s+'T00:00:00.000Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s)fail('DATE_INVALID');
 return s;
};
const https=value=>{
 if(value==='')return true;
 if(!validString(value,2048)||/[\u0000-\u0020\u007f]/.test(value))return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&
   !u.username&&!u.password&&!u.hash;}catch{return false}
};
const image=value=>value===''||
 typeof value==='string'&&value.length<=1024&&(
  /^\/assets\/[a-zA-Z0-9_/-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(value)&&!value.includes('..')||
  /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(value)&&!value.includes('..')
 );
const validCursor=cursor=>{
 if(cursor===null)return null;
 if(!cursor||typeof cursor!=='object'||Array.isArray(cursor)||
    Object.keys(cursor).sort().join(',')!=='id,updatedAt'||!UUID.test(cursor.id||''))fail('CURSOR_INVALID');
 let updatedAt;
 try{updatedAt=isoTime(cursor.updatedAt);}catch{fail('CURSOR_INVALID')}
 return Object.freeze({id:cursor.id.toLowerCase(),updatedAt});
};
const validRow=row=>{
 if(!row||typeof row!=='object'||!UUID.test(row.id||'')||
   row.status!=='draft'||!ROOMS.has(row.kind)||!CATEGORIES.has(row.category)||
   !validString(row.title,120)||!row.title.trim()||
   !validString(row.description,2000)||!validString(row.credit,80)||
   !validString(row.external_url,2048)||!https(row.external_url)||
   !validString(row.image_url,1024)||!image(row.image_url))fail('ROW_UNVERIFIED');
 const revision=typeof row.revision==='string'&&/^(0|[1-9]\d*)$/.test(row.revision)?
  Number(row.revision):row.revision;
 if(!Number.isSafeInteger(revision)||revision<0||revision>2147483647)fail('REVISION_INVALID');
 return Object.freeze({
  id:row.id.toLowerCase(),revision,status:'draft',editable:true,
  room:row.kind,category:row.category,title:row.title,description:row.description,
  credit:row.credit,occurredOn:isoDate(row.occurred_on),
  imageUrl:row.image_url,externalUrl:row.external_url,updatedAt:isoTime(row.updated_at)
 });
};
const earlier=(a,b)=>a.updatedAt<b.updatedAt||
 a.updatedAt===b.updatedAt&&a.id<b.id;

// A checked-out client must be bound to the independently verified museum
// database BEFORE this is called (via withDedicatedMuseumStageClient).
export async function listMuseumPrivateDraftsStage(client,{
 request,verifyOwner,room=null,limit=20,cursor=null
}={}){
 if(!client||typeof client.query!=='function')fail('DEDICATED_CLIENT_REQUIRED');
 if(typeof verifyOwner!=='function')fail('OWNER_VERIFIER_REQUIRED');
 if(room!==null&&!ROOMS.has(room))fail('ROOM_INVALID');
 if(!Number.isInteger(limit)||limit<1||limit>50)fail('LIMIT_INVALID');
 const after=validCursor(cursor);
 let active=false,commitAttempted=false;
 try{
  const begun=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(begun?.command!=='BEGIN')fail('BEGIN_UNVERIFIED');
  active=true;
  const owner=await verifyOwner(client,request);
  if(!owner||owner.role!=='owner'||typeof owner.user_id!=='string'||
    !UUID.test(owner.user_id))fail('OWNER_AUTH_REQUIRED');
  // Explicit columns and status='draft': never expose private moderation,
  // authentication, device, prize, or participant columns.
  const result=await client.query(
   'SELECT id,kind,category,title,description,credit,occurred_on,image_url,external_url,'+
   'status,revision,updated_at FROM museum_public_exhibits '+
   "WHERE status='draft' "+
   'AND ($1::text IS NULL OR kind=$1::text) '+
   'AND ($2::timestamptz IS NULL OR (updated_at,id)<($2::timestamptz,$3::uuid)) '+
   'ORDER BY updated_at DESC,id DESC LIMIT $4',
   [room,after?.updatedAt??null,after?.id??null,limit+1]
  );
  if(!result||result.command!=='SELECT'||!Number.isSafeInteger(result.rowCount)||
    result.rowCount<0||result.rowCount>limit+1||
    !Array.isArray(result.rows)||result.rows.length!==result.rowCount)
    fail('RESULT_UNVERIFIED');
  const seen=new Set(),valid=[];
  for(const row of result.rows){
   const item=validRow(row);
   if(seen.has(item.id)||room!==null&&item.room!==room||
     after&&!earlier(item,after)||valid.length>0&&!earlier(item,valid[valid.length-1]))
    fail('ROW_ORDER_UNVERIFIED');
   seen.add(item.id);valid.push(item);
  }
  const page=valid.slice(0,limit);
  const last=page.at(-1);
  const nextCursor=valid.length>limit?Object.freeze({
   updatedAt:last.updatedAt,id:last.id
  }):null;
  commitAttempted=true;
  const done=await client.query('COMMIT');
  if(done?.command!=='COMMIT')fail('COMMIT_UNVERIFIED');
  active=false;
  return Object.freeze({items:Object.freeze(page),nextCursor,hasMore:nextCursor!==null,
   onlyPrivateDrafts:true});
 }catch(error){
  if(active&&!commitAttempted){
   try{const undone=await client.query('ROLLBACK');if(undone?.command!=='ROLLBACK')
     fail('ROLLBACK_UNVERIFIED');}catch{fail('ROLLBACK_UNVERIFIED')}
  }
  if(commitAttempted)fail('COMMIT_UNVERIFIED');
  // Do not leak DB drivers' SQL errors or credentials.
  if(error instanceof Error&&error.message.startsWith('MUSEUM_DRAFT_LIST_'))throw error;
  fail('QUERY_FAILED');
 }
}


// Owner-only detail read for selecting a draft from the inbox. Read and edit
// are intentionally two distinct operations: a future edit MUST supply the
// revision returned here, then CAS it against status='draft' on its own
// verified transaction. This lookup never changes review/publication state.
export async function getMuseumPrivateDraftStage(client,{
 request,verifyOwner,exhibitId,expectedRevision=null
}={}){
 if(!client||typeof client.query!=='function')fail('DEDICATED_CLIENT_REQUIRED');
 if(typeof verifyOwner!=='function')fail('OWNER_VERIFIER_REQUIRED');
 if(typeof exhibitId!=='string'||!UUID.test(exhibitId))fail('EXHIBIT_ID_INVALID');
 if(expectedRevision!==null&&(!Number.isSafeInteger(expectedRevision)||
   expectedRevision<0||expectedRevision>2147483647))fail('EXPECTED_REVISION_INVALID');
 let active=false,commitAttempted=false;
 try{
  const begun=await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(begun?.command!=='BEGIN')fail('BEGIN_UNVERIFIED');
  active=true;
  const owner=await verifyOwner(client,request);
  if(!owner||owner.role!=='owner'||typeof owner.user_id!=='string'||
    !UUID.test(owner.user_id))fail('OWNER_AUTH_REQUIRED');
  // Never query a deleted/hidden/published item and never expose moderation,
  // session, user/device, member or prize records to the browser.
  const result=await client.query(
   'SELECT id,kind,category,title,description,credit,occurred_on,image_url,external_url,'+
   "status,revision,updated_at FROM museum_public_exhibits "+
   "WHERE id=$1::uuid AND status='draft' LIMIT 2",
   [exhibitId.toLowerCase()]
  );
  if(!result||result.command!=='SELECT'||![0,1].includes(result.rowCount)||
    !Array.isArray(result.rows)||result.rows.length!==result.rowCount)
   fail('DETAIL_RESULT_UNVERIFIED');
  const item=result.rowCount===1?validRow(result.rows[0]):null;
  if(item&&item.id!==exhibitId.toLowerCase())fail('DETAIL_ID_MISMATCH');
  if(item&&expectedRevision!==null&&expectedRevision!==item.revision)
   fail('REVISION_CHANGED');
  commitAttempted=true;
  const done=await client.query('COMMIT');
  if(done?.command!=='COMMIT')fail('COMMIT_UNVERIFIED');
  active=false;
  return Object.freeze({
   found:item!==null,item,editable:item!==null,
   // No information about the state of missing or non-draft exhibits.
   onlyPrivateDrafts:true
  });
 }catch(error){
  if(active&&!commitAttempted){
   try{const rolled=await client.query('ROLLBACK');
    if(rolled?.command!=='ROLLBACK')fail('ROLLBACK_UNVERIFIED');
   }catch{fail('ROLLBACK_UNVERIFIED')}
  }
  if(commitAttempted)fail('COMMIT_UNVERIFIED');
  if(error instanceof Error&&error.message.startsWith('MUSEUM_DRAFT_LIST_'))throw error;
  fail('QUERY_FAILED');
 }
}
