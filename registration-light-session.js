// Signed light-enrollment cookie. Separate from the legacy MIO session.
// A light cookie alone never grants attendance or gacha access.
import {createHmac,timingSafeEqual} from 'node:crypto';
const COOKIE='mio_light_session';
function sign(data,key){
 return createHmac('sha256',key).update('mio-light-v1:'+data).digest();
}
export function setLightSessionCookie(id,token,key){
 const encoded=Buffer.from(JSON.stringify({id,token})).toString('base64url');
 return COOKIE+'='+encoded+'.'+sign(encoded,key).toString('base64url')+
  '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=7776000';
}
export function readLightSession(cookie,key){
 try{
  if(typeof key!=='string'||key.length<48)return null;
  const raw=String(cookie||'').split(';').map(x=>x.trim())
   .find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!raw)return null;
  const [data,sig,...extra]=raw.split('.');
  if(extra.length||!data||!sig)return null;
  const expected=sign(data,key),actual=Buffer.from(sig,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  const value=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
  if(!/^MIO-W-[a-f0-9]{24}$/.test(value.id)||!/^[a-f0-9]{64}$/.test(value.token))return null;
  return value;
 }catch{return null}
}
