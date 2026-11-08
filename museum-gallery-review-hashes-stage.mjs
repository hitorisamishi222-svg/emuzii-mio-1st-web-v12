// MIO museum - unexposed, staging-only review generation barrier.
// A gallery layout cannot confer rights: a publication must pin a verified
// fingerprint for each displayed exhibit, and a visitor must compare it with
// the current authoritative review before showing the exhibit. This protects
// against automatic resurrection after withdrawal and later reapproval.
// These hashes are NOT credentials or new grants. Server moderation writes
// must update the underlying DB revision / updated_at; the real DB is not wired.
const ID=/^[a-z0-9-]{3,70}$/;
const HASH=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error('MUSEUM_REVIEW_'+code)};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const ids=x=>Array.isArray(x)&&x.length<=500&&
 x.every(v=>typeof v==='string'&&ID.test(v))&&new Set(x).size===x.length;
const hashes=x=>{
 if(!record(x))fail('HASHES_INVALID');
 const keys=Object.keys(x);
 if(keys.length>500||keys.some(k=>!ID.test(k)||!HASH.test(x[k])))fail('HASHES_INVALID');
 return keys;
};
const required=(visibleIds,snapshot)=>{
 if(!ids(visibleIds))fail('VISIBLE_IDS_INVALID');
 const keys=hashes(snapshot);
 if(keys.length!==visibleIds.length||keys.some(id=>!visibleIds.includes(id)))
  fail('SNAPSHOT_INCOMPLETE');
};
export function captureMuseumReviewHashes({visibleIds,currentReviewHashes}={}){
 if(!ids(visibleIds))fail('VISIBLE_IDS_INVALID');
 hashes(currentReviewHashes);
 const result=Object.create(null);
 for(const id of visibleIds){
  if(!Object.hasOwn(currentReviewHashes,id))
   fail('CURRENT_APPROVAL_MISSING');
  result[id]=currentReviewHashes[id];
 }
 return Object.freeze(result);
}
export function selectCurrentlyReviewedMuseumIds({
 visibleIds,publishedReviewHashes,currentReviewHashes,requireEvery=false
}={}){
 required(visibleIds,publishedReviewHashes);
 hashes(currentReviewHashes);
 if(typeof requireEvery!=='boolean')fail('MODE_INVALID');
 const allowed=[];
 for(const id of visibleIds){
  if(Object.hasOwn(currentReviewHashes,id)&&
     currentReviewHashes[id]===publishedReviewHashes[id]){
   allowed.push(id);
  }else if(requireEvery){
   fail('HISTORICAL_APPROVAL_CHANGED');
  }
 }
 return Object.freeze(allowed);
}
