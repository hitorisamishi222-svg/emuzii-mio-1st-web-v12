// MIO museum - DRAFT-ONLY, pure projection of a previously published layout.
// No HTTP route, credentials, SQL calls, writes, or public deployment.
// "authoritative" inputs must be fetched again from the approved gallery DB:
// a saved layout is NEVER a grant of publication rights.
const ID=/^[a-z0-9-]{3,70}$/;
const fail=(code)=>{throw Error('MUSEUM_PUBLIC_'+code)};
const ids=(x)=>Array.isArray(x)&&x.length<=500&&x.every(v=>typeof v==='string'&&ID.test(v))&&new Set(x).size===x.length;
const plain=(x)=>x&&typeof x==='object'&&!Array.isArray(x);
const safePath=x=>typeof x==='string'&&/^\/(?!\/)[A-Za-z0-9_./-]+$/.test(x)&&!x.includes('..');
const safeWeb=x=>{
 if(typeof x!=='string'||x.length>2048)return false;
 try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}
 catch{return false}
};
// Images in a curated museum exhibit may have no destination link.
// Empty is safe; a nonempty link still needs a vetted path or HTTPS URL.
const safeLink=x=>x===''||safePath(x)||safeWeb(x);
const safeThumbnail=x=>x===''||(
 typeof x==='string'&&x.length<=1024&&(
 /^\/assets\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(x)&&!x.includes('..')||
 /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(x)&&!x.includes('..')
 )
);
const safeText=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x);
// Do not pass the caller's browser-provided approval or status as trusted data.
export function projectPublishedMuseumGallery({
 authoritativeCatalog, verifiedApprovedIds, sourceVerified, publishedLayout
}={}){
 if(sourceVerified!==true||!Array.isArray(authoritativeCatalog)||authoritativeCatalog.length>500||
    !ids(verifiedApprovedIds))fail('SOURCE_UNVERIFIED');
 const byId=new Map();
 for(const item of authoritativeCatalog){
  if(!plain(item)||typeof item.id!=='string'||!ID.test(item.id)||byId.has(item.id)||
     typeof item.hidden!=='boolean'||typeof item.deleted!=='boolean'||
     !safeText(item.title,120)||!safeText(item.category,40)||
     !safeText(item.creator,80)||typeof item.description!=='string'||
     item.description.length>2000||typeof item.thumbnail!=='string'||
     !safeThumbnail(item.thumbnail)||!safeLink(item.url))fail('CATALOG_INVALID');
  byId.set(item.id,item);
 }
 if(verifiedApprovedIds.some(id=>!byId.has(id)))fail('APPROVAL_MISMATCH');
 if(publishedLayout===null){
  return Object.freeze({published:false,revision:null,items:Object.freeze([])});
 }
 if(!plain(publishedLayout)||!Number.isSafeInteger(publishedLayout.revision)||
    publishedLayout.revision<0||!ids(publishedLayout.order)||
    !ids(publishedLayout.visibleIds)||publishedLayout.visibleIds.some(id=>!publishedLayout.order.includes(id))||
    !(publishedLayout.featuredId===null||
      typeof publishedLayout.featuredId==='string'&&publishedLayout.visibleIds.includes(publishedLayout.featuredId)))
  fail('LAYOUT_INVALID');
 const approved=new Set(verifiedApprovedIds);
 const visible=new Set(publishedLayout.visibleIds);
 const items=[];
 for(const id of publishedLayout.order){
  if(!visible.has(id)||!approved.has(id))continue;
  const item=byId.get(id);
  // A later moderator takedown overrides any older published snapshot.
  if(!item||item.hidden||item.deleted)continue;
  items.push(Object.freeze({
   id:item.id,title:item.title,creator:item.creator,
   category:item.category,description:item.description,
   url:item.url,thumbnail:item.thumbnail,featured:id===publishedLayout.featuredId
  }));
 }
 return Object.freeze({
  published:true,revision:publishedLayout.revision,items:Object.freeze(items)
 });
}
