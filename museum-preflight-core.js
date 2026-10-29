// Read-only schema readiness checks for the public museum archive.
// The results never contain private data, connection strings, DB hostnames or user identifiers.
export const REQUIRED_MUSEUM_SCHEMA=Object.freeze({
 gallery_admin_users:['id','role','status'],
 gallery_admin_devices:['id','user_id','device_public_id','status'],
 gallery_admin_sessions:['user_id','device_id','token_hash','expires_at','revoked_at'],
 gallery_admin_audit:['actor_id','action','target','result'],
 museum_public_exhibits:[
  'id','kind','title','description','credit','occurred_on','image_url','external_url',
  'status','trashed_at','revision','rights_checked_at','privacy_checked_at',
  'reviewed_by','published_at','created_at','updated_at'
 ]
});
export const REQUIRED_STATUS=Object.freeze(['draft','published','hidden','trash']);
export function museumSchemaReport({columns,constraints,identityVerified}){
 if(!Array.isArray(columns)||!Array.isArray(constraints))throw TypeError('Invalid schema inspection data');
 const present=new Map();
 for(const row of columns){
  if(typeof row?.table_name!=='string'||typeof row?.column_name!=='string')continue;
  if(!Object.hasOwn(REQUIRED_MUSEUM_SCHEMA,row.table_name))continue;
  if(!present.has(row.table_name))present.set(row.table_name,new Set());
  present.get(row.table_name).add(row.column_name);
 }
 const tables=Object.entries(REQUIRED_MUSEUM_SCHEMA).map(([table,required])=>{
  const found=present.get(table)||new Set();
  return {table,exists:found.size>0,missing:required.filter(field=>!found.has(field))};
 });
 const checks=constraints.map(row=>String(row?.definition||''));
 const statusesOk=REQUIRED_STATUS.every(v=>checks.some(s=>s.includes("'"+v+"'")));
 const schemaReady=tables.every(x=>x.exists&&x.missing.length===0)&&statusesOk;
 return {
  identityVerified:identityVerified===true,
  schemaReady,
  allReady:schemaReady&&identityVerified===true,
  tables,
  statusConstraintComplete:statusesOk
 };
}
