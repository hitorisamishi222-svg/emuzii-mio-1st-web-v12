// DRAFT ONLY: pure, read-only layout preview for a future museum gallery editor.
// Does not import a DB client, touch published items, write storage or authorize release.
// verifiedApprovedIds must eventually come from a *server-authoritative* moderation read,
// never from an untrusted browser payload or static gallery-items.js alone.
const ID=/^[a-z0-9-]{3,70}$/;
const CATEGORY=new Set(['動画','イラスト','音声・楽曲','ファンアート','その他']);
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const list=(v,max)=>Array.isArray(v)&&v.length<=max&&v.every(id=>typeof id==='string'&&ID.test(id))&&new Set(v).size===v.length;
const safeThumbnail=v=>v===''||typeof v==='string'&&(
 /^\/assets\/[a-zA-Z0-9_/-]+\.(?:svg|jpe?g|png|webp|gif)$/i.test(v)&&!v.includes('..')||
 /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(v)&&!v.includes('..')
);
const reject=reason=>{throw Error('MUSEUM_PLAN_'+reason)};
export function planMuseumCuration({catalog,verifiedApprovedIds,currentRevision,proposal}={}){
 if(!Array.isArray(catalog)||catalog.length>500)reject('CATALOG_INVALID');
 if(!list(verifiedApprovedIds,500))reject('APPROVAL_INVALID');
 if(!Number.isSafeInteger(currentRevision)||currentRevision<0||currentRevision===Number.MAX_SAFE_INTEGER)reject('REVISION_INVALID');
 if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||
    Object.keys(proposal).sort().join(',')!=='expectedRevision,featuredId,order,visibleIds')reject('PROPOSAL_INVALID');
 if(!Number.isSafeInteger(proposal.expectedRevision)||proposal.expectedRevision!==currentRevision)reject('REVISION_CONFLICT');
 if(!list(proposal.order,500)||!list(proposal.visibleIds,500))reject('ORDER_INVALID');
 const byId=new Map();
 for(const item of catalog){
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!ID.test(item.id)||
     !text(item.title,120)||!text(item.category,40)||!CATEGORY.has(item.category)||
     typeof item.hidden!=='boolean'||typeof item.deleted!=='boolean'||
     !safeThumbnail(item.thumbnail)||byId.has(item.id))reject('CATALOG_INVALID');
  byId.set(item.id,item);
 }
 if(proposal.order.length!==byId.size||proposal.order.some(id=>!byId.has(id)))reject('ORDER_INVALID');
 if(verifiedApprovedIds.some(id=>!byId.has(id)))reject('APPROVAL_INVALID');
 const approved=new Set(verifiedApprovedIds);
 const visible=new Set(proposal.visibleIds);
 for(const id of visible){
  const item=byId.get(id);
  if(!item||!approved.has(id)||item.hidden||item.deleted)reject('VISIBILITY_UNAPPROVED');
 }
 if(proposal.featuredId!==null&&
    (typeof proposal.featuredId!=='string'||!visible.has(proposal.featuredId)))reject('FEATURE_INVALID');
 const preview=proposal.order.filter(id=>visible.has(id)).map(id=>{
  const item=byId.get(id);
  return Object.freeze({id,title:item.title,category:item.category,
    thumbnail:item.thumbnail,featured:id===proposal.featuredId});
 });
 // Revision is hypothetical; no token, auth, approval or publication is granted here.
 return Object.freeze({
  expectedRevision:currentRevision,
  candidateRevision:currentRevision+1,
  orderedIds:Object.freeze([...proposal.order]),
  visibleIds:Object.freeze([...proposal.visibleIds]),
  featuredId:proposal.featuredId,
  preview:Object.freeze(preview),
  approvedForPublication:false,
  persisted:false
 });
}
