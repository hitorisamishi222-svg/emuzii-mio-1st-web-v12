// Read-only database schema inspection for the MIO public museum.
// A checked-in migration is not evidence that it was applied to a real database.
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
// This is needed ONLY by the optional asset-reference audit.
// Its absence must not be confused with readiness of the public gallery.
export const OPTIONAL_ASSET_SCHEMA=Object.freeze({
 gallery_live_overrides:['item_id','thumbnail_url','hidden','deleted','revision']
});
export const REQUIRED_COLUMN_TYPES=Object.freeze({
 'gallery_admin_users.id':'uuid',
 'gallery_admin_devices.id':'uuid',
 'gallery_admin_devices.user_id':'uuid',
 'gallery_admin_sessions.user_id':'uuid',
 'gallery_admin_sessions.device_id':'uuid',
 'gallery_admin_sessions.token_hash':'text',
 'gallery_admin_audit.actor_id':'uuid',
 'museum_public_exhibits.id':'uuid',
 'museum_public_exhibits.occurred_on':'date',
 'museum_public_exhibits.reviewed_by':'uuid',
 'museum_public_exhibits.revision':'integer',
 'museum_public_exhibits.status':'text',
 'museum_public_exhibits.trashed_at':'timestamp with time zone',
 'museum_public_exhibits.rights_checked_at':'timestamp with time zone',
 'museum_public_exhibits.privacy_checked_at':'timestamp with time zone',
 'museum_public_exhibits.updated_at':'timestamp with time zone',
 'gallery_live_overrides.thumbnail_url':'text'
});
export const REQUIRED_STATUS=Object.freeze(['draft','published','hidden','trash']);
// The minimum ownership and audit relationships required by the shipped SQL.
export const REQUIRED_FOREIGN_KEYS=Object.freeze([
 ['gallery_admin_devices','user_id','gallery_admin_users','id'],
 ['gallery_admin_sessions','user_id','gallery_admin_users','id'],
 ['gallery_admin_sessions','device_id','gallery_admin_devices','id'],
 ['gallery_admin_audit','actor_id','gallery_admin_users','id'],
 ['museum_public_exhibits','reviewed_by','gallery_admin_users','id']
]);
export const REQUIRED_NOT_NULL=Object.freeze({
 gallery_admin_users:['id','role','status'],
 gallery_admin_devices:['id','user_id','device_public_id','status'],
 gallery_admin_sessions:['user_id','device_id','token_hash','expires_at'],
 gallery_admin_audit:['action','result'],
 museum_public_exhibits:[
  'id','kind','title','description','credit','image_url','external_url',
  'status','revision','rights_checked_at','privacy_checked_at','reviewed_by',
  'created_at','updated_at'
 ]
});

const resultFor=(schema,present)=>{
 return Object.entries(schema).map(([table,required])=>{
  const actual=present.get(table)||new Map();
  const missing=required.filter(field=>!actual.has(field));
  const wrongNullability=(REQUIRED_NOT_NULL[table]||[]).filter(field=>{
   const column=actual.get(field);
   return column&&column.nullable!==false;
  });
  const wrongTypes=required.flatMap(field=>{
   if(!actual.has(field))return [];
   const expected=REQUIRED_COLUMN_TYPES[table+'.'+field];
   if(!expected)return [];
   const observed=actual.get(field)?.dataType;
   if(observed!==expected)return [field];
   return [];
  });
  return {table,exists:actual.size>0,missing,wrongTypes,wrongNullability};
 });
};
export function museumSchemaReport({columns,constraints,identityVerified}){
 if(!Array.isArray(columns)||!Array.isArray(constraints))throw TypeError('Invalid schema inspection data');
 const present=new Map();
 const names=new Set([...Object.keys(REQUIRED_MUSEUM_SCHEMA),...Object.keys(OPTIONAL_ASSET_SCHEMA)]);
 for(const row of columns){
  if(typeof row?.table_name!=='string'||typeof row?.column_name!=='string')continue;
  if(!names.has(row.table_name))continue;
  if(!present.has(row.table_name))present.set(row.table_name,new Map());
  // Missing or unsupported type metadata must not accidentally pass a type check.
  present.get(row.table_name).set(row.column_name,{
   dataType:typeof row.data_type==='string'?row.data_type:null,
   nullable:row.is_nullable==='NO'?false:row.is_nullable==='YES'?true:null
  });
 }
 const tables=resultFor(REQUIRED_MUSEUM_SCHEMA,present);
 const optionalTables=resultFor(OPTIONAL_ASSET_SCHEMA,present);
 const normalized=(value)=>String(value||'')
  .replace(/"/g,'').replace(/\s+/g,' ').trim();
 const validated=constraints.filter(row=>row?.validated===true);
 const statusConstraintComplete=validated.some(row=>{
  const s=normalized(row.definition);
  return row.table_name==='museum_public_exhibits'&&row.contype==='c'&&
   /\bCHECK\b/i.test(s)&&/\bstatus\b/i.test(s)&&
   REQUIRED_STATUS.every(v=>s.includes("'"+v+"'"));
 });
 const foreignKeys=REQUIRED_FOREIGN_KEYS.map(([table,column,refTable,refColumn])=>{
  const matches=validated.some(row=>{
   if(row.contype!=='f'||row.table_name!==table)return false;
   const s=normalized(row.definition).replace(/\b[a-z_][\w]*\./gi,'');
   const expected='FOREIGN KEY ('+column+') REFERENCES '+refTable+'('+refColumn+')';
   return s.includes(expected);
  });
  return {table,column,present:matches};
 });
 const constraintsReady=statusConstraintComplete&&foreignKeys.every(x=>x.present);
 const tablesReady=tables.every(x=>x.exists&&x.missing.length===0&&
  x.wrongTypes.length===0&&x.wrongNullability.length===0);
 const schemaReady=tablesReady&&constraintsReady;
 return {
  identityVerified:identityVerified===true,
  schemaReady,
  allReady:schemaReady&&identityVerified===true,
  tables,
  statusConstraintComplete,
  constraintsReady,
  foreignKeys,
  optionalTables,
  assetAuditReady:optionalTables.every(x=>x.exists&&x.missing.length===0&&x.wrongTypes.length===0&&x.wrongNullability.length===0)
 };
}
