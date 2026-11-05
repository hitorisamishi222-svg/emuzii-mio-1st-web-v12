// DRAFT-ONLY museum one-release schema metadata evaluator.
// The older museumSchemaReport covers museum_public_exhibits and owner auth,
// but NOT the layout/history/audit tables needed for the single release.
// All input MUST come from read-only introspection of the exact verified
// production candidate DB; checked-in SQL is never proof of migration.
import {museumSchemaReport} from './museum-preflight-core.js';

const REQUIRED=Object.freeze({
 gallery_live_overrides:{
  item_id:'text',hidden:'boolean',deleted:'boolean',
  revision:'bigint',updated_at:'timestamp with time zone'
 },
 museum_gallery_layout_stage:{
  layout_key:'text',draft_revision:'bigint',draft_order:'jsonb',
  draft_visible_ids:'jsonb',draft_featured_id:'text',drafted_by:'uuid',
  published_revision:'bigint',published_from_draft_revision:'bigint',
  published_order:'jsonb',published_visible_ids:'jsonb',published_review_hashes:'jsonb',
  published_featured_id:'text',published_by:'uuid',
  published_at:'timestamp with time zone'
 },
 museum_gallery_layout_history_stage:{
  layout_key:'text',published_revision:'bigint',source_draft_revision:'bigint',
  snapshot_order:'jsonb',snapshot_visible_ids:'jsonb',snapshot_review_hashes:'jsonb',
  snapshot_featured_id:'text',published_by:'uuid',
  published_at:'timestamp with time zone'
 },
 museum_gallery_layout_audit_stage:{
  operation_id:'text',payload_hash:'text',actor_id:'uuid',
  action:'text',prior_revision:'bigint',new_revision:'bigint'
 }
});
const NOT_NULL=Object.freeze({
 gallery_live_overrides:['item_id','hidden','deleted','revision','updated_at'],
 museum_gallery_layout_stage:['layout_key','draft_revision','draft_order','draft_visible_ids'],
 museum_gallery_layout_history_stage:['layout_key','published_revision',
  'source_draft_revision','snapshot_order','snapshot_visible_ids','snapshot_review_hashes',
  'published_by','published_at'],
 museum_gallery_layout_audit_stage:['operation_id','payload_hash','actor_id',
  'action','prior_revision','new_revision']
});
const normalized=x=>String(x||'').toLowerCase()
 .replace(/"/g,'').replace(/\s+/g,' ').replace(/::(?:text|jsonb|uuid|bigint)/g,'').trim();
const constraint=(rows,table,kind,parts)=>rows.some(row=>{
 if(row?.table_name!==table||row.contype!==kind||row.validated!==true)return false;
 const definition=normalized(row.definition);
 return parts.every(p=>definition.includes(p.toLowerCase()));
});
export function museumGalleryReleaseSchemaReport({columns,constraints,identityVerified}={}){
 if(!Array.isArray(columns)||!Array.isArray(constraints))
  throw TypeError('Invalid museum release schema metadata');
 const base=museumSchemaReport({columns,constraints,identityVerified});
 const tables=Object.entries(REQUIRED).map(([table,fields])=>{
  const actual=new Map(columns.filter(x=>x?.table_name===table)
   .map(x=>[x.column_name,x]));
  const missing=Object.keys(fields).filter(col=>!actual.has(col));
  const wrongTypes=Object.entries(fields).filter(([name,type])=>
   actual.has(name)&&actual.get(name).data_type!==type).map(([name])=>name);
  const wrongNullability=(NOT_NULL[table]||[]).filter(name=>
   actual.has(name)&&actual.get(name).is_nullable!=='NO');
  return Object.freeze({
   table,exists:actual.size>0,
   missing:Object.freeze(missing),
   wrongTypes:Object.freeze(wrongTypes),
   wrongNullability:Object.freeze(wrongNullability),
   ready:actual.size>0&&!missing.length&&!wrongTypes.length&&!wrongNullability.length
  });
 });
 // A gallery-only checked-in migration is insufficient: the real database
 // must permit all four exact exhibition destinations used by the curator.
 const roomKindReady=constraints.some(row=>{
  if(row?.table_name!=='museum_public_exhibits'||
     row.contype!=='c'||row.validated!==true)return false;
  const expr=normalized(row.definition);
  // "kind IN (...)" combined with OR TRUE is NOT a protective CHECK.
  // Conservative: accept only a positive membership, without alternate OR
  // or negation. Actual PG metadata must be read, not copied from migration.
  return /\bkind\b\s*(?:in\s*\(|=\s*any\s*\()/i.test(expr)&&
   !/\b(?:or|not)\b/.test(expr)&&
   ['gallery','icons','moments','events'].every(kind=>expr.includes("'"+kind+"'"));
 });
 // The room identifies WHERE to show an exhibit, whereas its category
 // identifies WHAT media it contains. A DB that loses the media type is
 // never a ready candidate even when the four room keys are valid.
 const mediaCategoryReady=constraints.some(row=>{
  if(row?.table_name!=='museum_public_exhibits'||
     row.contype!=='c'||row.validated!==true)return false;
  const expr=normalized(row.definition);
  return /\bcategory\b\s*(?:in\s*\(|=\s*any\s*\()/i.test(expr)&&
   !/\b(?:or|not)\b/.test(expr)&&
   ['イラスト','動画','音声・楽曲','ファンアート','その他']
    .every(category=>expr.includes("'"+category+"'"));
 });
 // Existing gallery moderation must retain its unique ID and editor links.
 const workIdCheck="item_id ~ '^[a-z0-9-]{3,70}"+String.fromCharCode(36)+"'";
 const legacyChecks=Object.freeze({
  overridePrimary:constraint(constraints,'gallery_live_overrides','p',['item_id']),
  overrideIdFormat:constraints.some(row=>row?.table_name==='gallery_live_overrides'&&
   row.contype==='c'&&row.validated===true&&
   normalized(row.definition).includes(workIdCheck)),
  overrideActorFk:constraint(constraints,'gallery_live_overrides','f',
   ['updated_by','gallery_admin_users'])
 });
 // The on-disk SQL is not evidence: the inspected PostgreSQL CHECK must
 // independently reject rights or privacy reviews recorded after publication.
 const reviewChronologyReady=constraints.some(row=>{
  if(row?.table_name!=='museum_public_exhibits'||row.contype!=='c'||
     row.validated!==true)return false;
  const definition=normalized(row.definition);
  const status=/\bstatus\s*(?:<>|!=)\s*'published'/.exec(definition);
  const orMatches=[...definition.matchAll(/\bor\b/g)];
  // Exactly one OR: publishing must require BOTH conditions, not either.
  if(!status||orMatches.length!==1||/\bnot\b/.test(definition))return false;
  const orAt=orMatches[0].index;
  if(orAt<=status.index+status[0].length)return false;
  const proof=definition.slice(orAt+orMatches[0][0].length);
  const rights=/\brights_checked_at\s*<=\s*published_at\b/.exec(proof);
  const privacy=/\bprivacy_checked_at\s*<=\s*published_at\b/.exec(proof);
  if(!rights||!privacy)return false;
  // The two independent checks must be joined by AND (not OR).
  const between=proof.slice(Math.min(rights.index,privacy.index),
   Math.max(rights.index,privacy.index));
  return /\band\b/.test(between);
 });
 const sourceReady=tables.find(x=>x.table==='gallery_live_overrides')?.ready===true&&
  Object.values(legacyChecks).every(Boolean);
 const layoutTablesReady=tables.filter(x=>x.table!=='gallery_live_overrides')
  .every(x=>x.ready);
 const constraintChecks=Object.freeze({
  layoutPrimary:constraint(constraints,'museum_gallery_layout_stage','p',['layout_key']),
  historyUnique:constraint(constraints,'museum_gallery_layout_history_stage','u',
   ['layout_key','published_revision']),
  operationIdUnique:constraint(constraints,'museum_gallery_layout_audit_stage','u',['operation_id']),
  auditAction:constraint(constraints,'museum_gallery_layout_audit_stage','c',
   ["'draft'","'publish'","'rollback'"]),
  layoutVisibility:constraint(constraints,'museum_gallery_layout_stage','c',
   ['draft_order','@>','draft_visible_ids']),
  historyVisibility:constraint(constraints,'museum_gallery_layout_history_stage','c',
   ['snapshot_order','@>','snapshot_visible_ids']),
  publicationReviewType:constraint(constraints,'museum_gallery_layout_stage','c',
   ['jsonb_typeof(published_review_hashes)',"'object'"]),
  historyReviewType:constraint(constraints,'museum_gallery_layout_history_stage','c',
   ['jsonb_typeof(snapshot_review_hashes)',"'object'"]),
  approvedDeviceOwnerFk:constraint(constraints,'museum_gallery_layout_stage','f',
   ['drafted_by','gallery_admin_users']),
  publishOwnerFk:constraint(constraints,'museum_gallery_layout_history_stage','f',
   ['published_by','gallery_admin_users']),
  layoutPublishedOwnerFk:constraint(constraints,'museum_gallery_layout_stage','f',
   ['published_by','gallery_admin_users']),
  draftFeaturedVisibility:constraint(constraints,'museum_gallery_layout_stage','c',
   ['draft_featured_id','draft_visible_ids','?']),
  publishedFeaturedVisibility:constraint(constraints,'museum_gallery_layout_stage','c',
   ['published_featured_id','published_visible_ids','?']),
  historyFeaturedVisibility:constraint(constraints,'museum_gallery_layout_history_stage','c',
   ['snapshot_featured_id','snapshot_visible_ids','?']),
  auditOwnerFk:constraint(constraints,'museum_gallery_layout_audit_stage','f',
   ['actor_id','gallery_admin_users'])
 });
 const layoutReady=layoutTablesReady&&Object.values(constraintChecks).every(Boolean);
 return Object.freeze({
  identityVerified:identityVerified===true,
  baseMuseumReady:base.schemaReady,
  sourceReady,
  legacyChecks,
  roomKindReady,
  mediaCategoryReady,
  reviewChronologyReady,
  layoutReady,
  allReady:identityVerified===true&&base.schemaReady&&sourceReady&&roomKindReady&&
   mediaCategoryReady&&reviewChronologyReady&&layoutReady,
  tables:Object.freeze(tables),
  constraintChecks,
  // This report does NOT assert backup, owner signoff, or authorization.
  canPublish:false,
  canDeploy:false
 });
}
