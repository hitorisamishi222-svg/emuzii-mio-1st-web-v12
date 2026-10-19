import {createHmac,timingSafeEqual} from 'node:crypto';

const COOKIE_NAME='mio_registration_attempt';
const MAX_AGE=86400;
const validIdentity=x=>/^MIO-W-[a-f0-9]{24}$/.test(x?.id||'')&&
  /^[a-f0-9]{64}$/.test(x?.token||'');

function mac(encoded,secret){
  return createHmac('sha256',secret).update('registration-v1:'+encoded).digest();
}

export function readRegistrationAttempt(cookie,secret){
  try{
    const entry=String(cookie||'').split(';').map(x=>x.trim())
      .find(x=>x.startsWith(COOKIE_NAME+'='));
    if(!entry)return null;
    const [data,sig,...extra]=entry.slice(COOKIE_NAME.length+1).split('.');
    if(!data||!sig||extra.length)return null;
    const actual=Buffer.from(sig,'base64url'), expected=mac(data,secret);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const record=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));
    if(!validIdentity(record)||typeof record.name!=='string'||
      typeof record.loginId!=='string'||record.name.length>40||
      record.loginId.length>32||!Number.isSafeInteger(record.issuedAt)||
      record.issuedAt>Date.now()+60000||Date.now()-record.issuedAt>MAX_AGE*1000)
      return null;
    return record;
  }catch{return null;}
}

export function issueRegistrationAttempt({id,token,name,loginId},secret){
  if(!validIdentity({id,token}))throw Error('invalid registration identity');
  const data=Buffer.from(JSON.stringify({id,token,name,loginId,issuedAt:Date.now()})).toString('base64url');
  const signature=mac(data,secret).toString('base64url');
  return COOKIE_NAME+'='+data+'.'+signature+
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+MAX_AGE;
}

export function clearRegistrationAttempt(){
  return COOKIE_NAME+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
