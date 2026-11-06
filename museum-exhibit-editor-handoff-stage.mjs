// UNROUTED MIO museum edit-form handoff. Pure projection only.
// This is NOT authorization or persistence. The enclosing future owner
// handler must call getMuseumOwnerDraftStage against the verified isolated DB,
// then provide this data from the server. Never trust an HTTP body to claim
// owner identity, approval, or an editable private draft.
import {prepareMuseumExhibitFormDraftStage} from './museum-exhibit-ui-contract-stage.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const fail=code=>{throw Error('MUSEUM_EDITOR_HANDOFF_'+code)};
const own=(obj,keys)=>obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join('|')===[...keys].sort().join('|');
const DETAIL_FIELDS=['found','item','editable','onlyPrivateDrafts'];
const ITEM_FIELDS=['id','revision','status','editable','room','category','title',
 'description','credit','occurredOn','imageUrl','externalUrl','updatedAt'];
const isDate=x=>{
 if(x===null)return true;
 if(typeof x!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+'T00:00:00.000Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;
};
const safeUrl=x=>{
 if(x==='')return true;
 if(typeof x!=='string'||x.length>2048||/[\u0000-\u0020\u007f]/.test(x))return false;
 try{
  const url=new URL(x);
  return url.protocol==='https:'&&url.hostname.length>0&&
   !url.username&&!url.password&&!url.hash;
 }catch{return false}
};
const safeImage=x=>x===''||typeof x==='string'&&x.length<=1024&&
 (/^\/assets\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(x)&&!x.includes('..')||
 /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp)$/i.test(x)&&!x.includes('..'));
const time=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;

// The selection ID and revision must come from the private inbox. A changed
// item or stale revision is a hard stop; the user must refresh/reselect.
// The dirty guard prevents silent loss of form text during navigation.
export function prepareMuseumDraftEditorHandoffStage(detail,{
 selectedId,selectedRevision,currentFormDirty=false,
 confirmedDiscard=false
}={}){
 if(currentFormDirty!==true&&currentFormDirty!==false||
    confirmedDiscard!==true&&confirmedDiscard!==false)fail('UI_STATE_INVALID');
 if(currentFormDirty&&!confirmedDiscard)fail('UNSAVED_FORM');
 if(typeof selectedId!=='string'||!UUID.test(selectedId)||
    !Number.isSafeInteger(selectedRevision)||selectedRevision<0||
    selectedRevision>2147483647)fail('SELECTION_INVALID');
 if(!own(detail,DETAIL_FIELDS)||detail.found!==true||
    detail.editable!==true||detail.onlyPrivateDrafts!==true||
    !own(detail.item,ITEM_FIELDS))fail('DETAIL_UNVERIFIED');
 const item=detail.item;
 if(item.id.toLowerCase()!==selectedId.toLowerCase()||
    item.revision!==selectedRevision)fail('STALE_OR_WRONG_SELECTION');
 if(item.status!=='draft'||item.editable!==true||!UUID.test(item.id)||
    !Number.isSafeInteger(item.revision)||item.revision<0||
    item.revision>2147483647)fail('NOT_EDITABLE');
 if(typeof item.title!=='string'||!item.title.trim()||
    item.title.length>120||CONTROL.test(item.title)||
    typeof item.description!=='string'||item.description.length>2000||CONTROL.test(item.description)||
    typeof item.credit!=='string'||item.credit.length>80||CONTROL.test(item.credit)||
    !isDate(item.occurredOn)||!safeUrl(item.externalUrl)||
    !safeImage(item.imageUrl)||!time(item.updatedAt))fail('CONTENT_INVALID');
 const fields=Object.freeze({
  room:item.room,category:item.category,title:item.title,
  description:item.description,credit:item.credit,
  occurredOn:item.occurredOn,externalUrl:item.externalUrl
 });
 // The canonical form contract rejects unknown fields, including arbitrary
 // publication/rights flags and client-supplied image URLs.
 try{prepareMuseumExhibitFormDraftStage(fields)}catch{fail('CONTENT_INVALID')}
 return Object.freeze({
  mode:'edit',exhibitId:item.id.toLowerCase(),
  expectedRevision:item.revision,fields,
  // Display-only existing cover. NEVER add it to uiDraft submissions;
  // the server-side image-preserving update path is responsible for retention.
  existingCoverPreviewUrl:item.imageUrl,
  imageIsReadOnly:true,requiresFreshReviewOnSave:true,
  authorizedToWrite:false,readyToPublish:false
 });
}
