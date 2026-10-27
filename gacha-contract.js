/**
 * Gacha read-contract gate (pure shared helper for browser and Vercel API).
 * A legacy GAS that cannot describe the four-Web-draw/5th-draw rule must
 * never be used for a NEW draw. This does not prove a remote GAS deployment.
 */
export function hasSafeGachaContract(c){
  if(!c||typeof c!=='object'||c.ok!==true)return false;
  for(const key of ['confirmed','festEntitled','festUnlocked','normalOpen','festOpen'])
    if(typeof c[key]!=='boolean')return false;
  for(const key of ['used','remaining','nextOrdinal','webDrawsUsed','festAvailableFrom'])
    if(!Number.isSafeInteger(c[key])||c[key]<0)return false;
  if(c.festAvailableFrom<5||c.nextOrdinal!==c.used+1||c.webDrawsUsed>c.used)return false;
  const unlocked=c.festEntitled&&c.webDrawsUsed>=c.festAvailableFrom-1&&c.remaining>0;
  if(c.festUnlocked!==unlocked)return false;
  if(!c.normal||!c.fest)return false;
  for(const item of [c.normal,c.fest])
    if(typeof item.ready!=='boolean'||!Array.isArray(item.prizes))return false;
  return true;
}
