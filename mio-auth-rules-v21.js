/* MIO v2.1 pure account rules: preview and isolated tests only.
 * No real authentication, credential storage or production API.
 */
export function normalizeLoginId(value){return String(value).toLowerCase()}
export function validateLoginId(value){
 if(typeof value!=='string'||value.length<8||value.length>20)return '8〜20文字で入力してください。';
 if(!/^[A-Za-z0-9_.!@-]+$/.test(value))return '使用できない文字が含まれています。';
 const types=[/[A-Z]/,/[a-z]/,/[0-9]/,/[_\-.!@]/].filter(r=>r.test(value)).length;
 return types<3?'英大文字・英小文字・数字・記号から3種類以上を組み合わせてください。':'';
}
export function createDemoRegistry(){
 const accounts=new Map(),mioIds=new Map(),aliases=new Map();
 function register({accountId,mioId,loginId,attendance=0,rights=0}){
  if(!accountId||!mioId||accounts.has(accountId)||mioIds.has(normalizeLoginId(mioId)))throw Error('duplicate account or MIO-ID');
  if(validateLoginId(loginId))throw Error('invalid login ID');
  const canonical=normalizeLoginId(loginId);
  if(aliases.has(canonical)||mioIds.has(canonical))throw Error('identifier already used');
  const a={accountId,mioId,loginId,attendance,rights,sessions:new Set(),wins:[]};
  accounts.set(accountId,a);mioIds.set(normalizeLoginId(mioId),accountId);aliases.set(canonical,accountId);return a;
 }
 function resolve(identifier){const id=normalizeLoginId(identifier);return accounts.get(mioIds.get(id)||aliases.get(id))||null}
 function changeLoginId(accountId,newId){
  const a=accounts.get(accountId);if(!a)throw Error('account not found');
  if(validateLoginId(newId))throw Error('invalid login ID');
  const key=normalizeLoginId(newId),owner=aliases.get(key);
  if((owner&&owner!==accountId)||mioIds.has(key))throw Error('identifier already used');
  if(key===normalizeLoginId(a.loginId)){a.loginId=newId;return a}
  aliases.delete(normalizeLoginId(a.loginId));aliases.set(key,accountId);a.loginId=newId;return a;
 }
 function signIn(accountId,deviceId){const a=accounts.get(accountId);if(!a)throw Error('account not found');a.sessions.add(deviceId);return a.sessions.size}
 function signOut(accountId,deviceId){const a=accounts.get(accountId);if(!a)throw Error('account not found');a.sessions.delete(deviceId);return a.sessions.size}
 function consumeRight(accountId){const a=accounts.get(accountId);if(!a)throw Error('account not found');if(a.rights<=0)return false;a.rights--;return true}
 return {register,resolve,changeLoginId,signIn,signOut,consumeRight};
}
/* IMPORTANT: In production, changeLoginId requires recent re-authentication,
 * all identifiers need database unique constraints, and consumeRight must be
 * an atomic server-side transaction. Never expose this demo registry as auth.
 */