// Public memorial exhibits: strict metadata validation; no private vault content here.
export const MUSEUM_KINDS=Object.freeze(['icons','moments','events']);
const kindSet=new Set(MUSEUM_KINDS);
const imageExtension=/\.(?:png|jpe?g|webp|gif)$/i;
const text=(value,max,required=false,multiline=false)=>{
 if(typeof value!=='string')return null;
 const s=value.trim();
 if((required&&!s)||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))return null;
 if(!multiline&&/[\r\n]/.test(s))return null;
 return s;
};
export function archiveLink(raw){
 if(raw==='')return '';
 if(typeof raw!=='string'||raw!==raw.trim()||raw.length>2048)return null;
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.href.length>2048)return null;
  return u.href;
 }catch{return null;}
}
export function archiveImage(raw){
 if(raw==='')return '';
 if(typeof raw!=='string'||raw!==raw.trim()||raw.length>1024)return null;
 if(/^\/assets\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp|gif)$/i.test(raw)&&!raw.includes('..'))return raw;
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.hash||!imageExtension.test(u.pathname))return null;
  if(!/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname))return null;
  return u.href.length<=1024?u.href:null;
 }catch{return null;}
}
export function archiveDate(raw){
 if(raw==='')return '';
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;
 const d=new Date(raw+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==raw)return null;
 return raw;
}
export function validateArchiveExhibit(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 // Public-only: require affirmative review of rights AND screenshot privacy.
 if(value.rightsConfirmed!==true||value.privacyConfirmed!==true)return null;
 const kind=value.kind;
 if(!kindSet.has(kind))return null;
 const title=text(value.title,120,true);
 const description=text(value.description,2000,false,true);
 const credit=text(value.credit,80);
 const date=archiveDate(value.occurredOn);
 const image=archiveImage(value.imageUrl);
 const link=archiveLink(value.externalUrl);
 if(title===null||description===null||credit===null||date===null||image===null||link===null)return null;
 if((kind==='icons'||kind==='moments')&&!image)return null;
 if(!image&&!description&&!link)return null;
 return {kind,title,description,credit,occurredOn:date||null,imageUrl:image,externalUrl:link};
}
