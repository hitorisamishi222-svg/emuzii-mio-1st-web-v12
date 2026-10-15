// Server-side helpers for host-scoped, HttpOnly session cookies.
// Only HTTPS hosts can set the __Host- cookie prefix.
const COOKIE_NAME='__Host-mio_session';
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export function makeSessionCookie(token,{maxAgeSeconds=2592000}={}){
 if(!TOKEN.test(token))throw Error('invalid session token');
 if(!Number.isSafeInteger(maxAgeSeconds)||maxAgeSeconds<1||maxAgeSeconds>2592000)throw Error('invalid expiry');
 return COOKIE_NAME+'='+token+'; Path=/; Max-Age='+maxAgeSeconds+'; Secure; HttpOnly; SameSite=Lax';
}
export function expireSessionCookie(){
 return COOKIE_NAME+'=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax';
}
export function readSessionCookie(header){
 if(typeof header!=='string'||header.length>8192)return null;
 const values=header.split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE_NAME+'='));
 if(values.length!==1)return null;
 const token=values[0].slice(COOKIE_NAME.length+1);
 return TOKEN.test(token)?token:null;
}
