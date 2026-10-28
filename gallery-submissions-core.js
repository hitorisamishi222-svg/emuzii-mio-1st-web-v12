// Independent input checks for vNext fan-art submissions.
// Public form accepts links only; it never receives image/audio binaries.
const CATEGORIES=new Set(['動画','イラスト','音声・楽曲','ファンアート','その他']);
const clean=(v,max,required=false,multiline=false)=>{
 if(typeof v!=='string')return null;
 const s=v.trim();
 if(s.length>max||(required&&!s)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))return null;
 if(!multiline&&/[\r\n]/.test(s))return null;
 return s;
};
export function secureWorkUrl(raw){
 if(typeof raw!=='string'||raw.length>2048||raw.trim()!==raw)return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password)return null;
  if(url.href.length>2048)return null;
  return url.href;
 }catch{return null;}
}
export function validateGallerySubmission(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return null;
 if(body.website!==undefined&&body.website!=='')return null; // honeypot
 if(body.consent!==true)return null;
 const title=clean(body.title,120,true);
 const creator=clean(body.creator,80,true);
 const description=clean(body.description,1000,false,true);
 const category=body.category;
 const url=secureWorkUrl(body.url);
 if(title===null||creator===null||description===null||!CATEGORIES.has(category)||!url)return null;
 return {title,creator,description,category,url};
}

const REVIEW_ACTIONS=Object.freeze({
 approve:Object.freeze(['pending','approved']),
 reject:Object.freeze(['pending','rejected']),
 hide:Object.freeze(['approved','hidden']),
 restore:Object.freeze(['hidden','approved']),
 reopen:Object.freeze(['rejected','pending'])
});
export function reviewTransition(action){
 return Object.hasOwn(REVIEW_ACTIONS,action)?REVIEW_ACTIONS[action]:null;
}

const THUMB_EXT=/\.(?:png|jpe?g|webp|gif|svg)$/i;
export function secureMediaThumbnail(value){
 if(typeof value!=='string'||value.length>1024)return null;
 if(value==='')return '';
 if(/^\/assets\/[A-Za-z0-9_/-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(value)&&!value.includes('..'))return value;
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||!THUMB_EXT.test(u.pathname))return null;
  if(!/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname))return null;
  return u.href.length<=1024?u.href:null;
 }catch{return null;}
}
export function validateMediaAdminItem(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.consent!==true)return null;
 if(value.category!=='動画'&&value.category!=='音声・楽曲')return null;
 const title=clean(value.title,120,true),creator=clean(value.creator,80,true);
 const description=clean(value.description,1000,false,true);
 const url=secureWorkUrl(value.url),thumbnail=secureMediaThumbnail(value.thumbnail||'');
 if(title===null||creator===null||description===null||!url||thumbnail===null)return null;
 return {title,creator,description,category:value.category,url,thumbnail};
}
