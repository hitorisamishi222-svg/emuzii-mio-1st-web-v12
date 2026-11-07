// Read-only production GAS target audit. No Apps Script, Sheet or Vercel writes.
// Never print APPS_SCRIPT_URL, deployment IDs, tokens, source code or secrets.
// The fingerprint was verified against the EXISTING live Vercel APPS_SCRIPT_URL
// on 2026-11-07 and the user's original October deployment record.
// A matching deployment ID DOES NOT verify published version or deployed source.
import {createHash,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const KNOWN_LIVE_DEPLOYMENT_FINGERPRINT='56f7a120a7690ae79c9e6b7d7ba711729b46622c19c1d376a573d2a9738099c4';

const digest=id=>createHash('sha256').update(id,'utf8').digest('hex');
function equalHex(a,b){
 if(!/^[a-f0-9]{64}$/.test(a)||! /^[a-f0-9]{64}$/.test(b))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
export function auditGasTarget(value,expected=KNOWN_LIVE_DEPLOYMENT_FINGERPRINT){
 const stop=reason=>({ok:false,status:'STOP',reason,versionVerified:false,sourceVerified:false,publicationAllowed:false});
 if(typeof value!=='string'||!value.trim())return stop('NO_URL');
 if(value!==value.trim())return stop('URL_FORMAT');
 let url;
 try{url=new URL(value)}catch{return stop('INVALID_URL')}
 if(url.protocol!=='https:'||url.hostname!=='script.google.com'||
    url.username||url.password||url.port||url.search||url.hash)
   return stop('NONCANONICAL_TARGET');
 const m=/^\/macros\/s\/([A-Za-z0-9_-]{30,160})\/exec$/.exec(url.pathname);
 if(!m)return stop('NOT_DEPLOYED_WEB_APP');
 if(!equalHex(digest(m[1]),expected))return stop('DIFFERENT_DEPLOYMENT');
 return {ok:true,status:'KNOWN_DEPLOYMENT_ID_MATCH',reason:'IDENTITY_ONLY',
   versionVerified:false,sourceVerified:false,publicationAllowed:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const result=auditGasTarget(process.env.APPS_SCRIPT_URL||'');
 // Fixed status only. Never log credentials or any URL component.
 process.stdout.write(JSON.stringify(result)+'\n');
 if(!result.ok)process.exitCode=1;
}
