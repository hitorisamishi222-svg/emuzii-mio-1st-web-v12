// Isolated COMMUNITY preparation module. No DB, network, or production writes.
const MAX_MESSAGE_LENGTH=300;
const VIDEO_HOSTS=new Set(['www.youtube.com','youtube.com','youtu.be','www.tiktok.com','tiktok.com','vm.tiktok.com']);
export function validatePublicMessage(value){
 if(typeof value!=='string')return {ok:false,code:'BAD_MESSAGE'};
 const body=value.trim();
 if(!body||[...body].length>MAX_MESSAGE_LENGTH)return {ok:false,code:'MESSAGE_LENGTH'};
 if(/[<>]/.test(body) || /https?:\/\/|www\.|javascript:|data:/i.test(body))return {ok:false,code:'DISALLOWED_CONTENT'};
 if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(body))return {ok:false,code:'BAD_CHARACTERS'};
 return {ok:true,body};
}
export function mayWrite({identity,permission,emergencyStop=false}){
 return identity?.verified===true && identity?.active===true && permission?.approved===true &&
        permission?.participantId===identity.participantId && emergencyStop!==true;
}
export function validateExternalVideoUrl(raw){
 if(typeof raw!=='string'||raw.length>2048)return {ok:false,code:'BAD_URL'};
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!VIDEO_HOSTS.has(url.hostname.toLowerCase()))return {ok:false,code:'BAD_URL'};
  if(url.hostname.toLowerCase().endsWith('youtube.com') && !['/watch','/shorts/','/live/','/embed/'].some(x=>url.pathname===x||url.pathname.startsWith(x)))return {ok:false,code:'BAD_PATH'};
  if(url.hostname.toLowerCase()==='youtu.be' && !/^\/[a-zA-Z0-9_-]{6,}$/.test(url.pathname))return {ok:false,code:'BAD_PATH'};
  if(url.pathname==='/'||url.pathname.startsWith('//'))return {ok:false,code:'BAD_PATH'};
  return {ok:true,url:url.href};
 }catch{return {ok:false,code:'BAD_URL'}}
}
export function publicMessages(rows,limit=50){
 const count=Math.min(50,Math.max(1,Number.isInteger(limit)?limit:50));
 if(!Array.isArray(rows))return [];
 return rows.filter(r=>r?.moderationState==='published'&&r?.deleted!==true)
  .slice(0,count).map(r=>({id:r.id,nickname:r.nickname,body:r.body,createdAt:r.createdAt}));
}
export function publicMedia(rows,kind,limit=24){
 if(!['video','photo'].includes(kind)||!Array.isArray(rows))return [];
 const count=Math.min(24,Math.max(1,Number.isInteger(limit)?limit:24));
 return rows.filter(r=>r?.approvalState==='published'&&r?.kind===kind&&r?.deleted!==true)
  .slice(0,count).map(r=>({id:r.id,kind:r.kind,source:r.source,title:r.title,nickname:r.nickname,description:r.description,thumbnail:r.thumbnail,url:r.url,publishedAt:r.publishedAt}));
}
export function publishedNotices(rows,now=Date.now()){
 if(!Array.isArray(rows))return [];
 return rows.filter(x=>x?.approved===true&&x?.public===true&&(!x.startsAt||Date.parse(x.startsAt)<=now)&&(!x.expiresAt||Date.parse(x.expiresAt)>now))
 .map(x=>({id:x.id,text:x.text,url:x.url,startsAt:x.startsAt,expiresAt:x.expiresAt}));
}
