import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url),'utf8'));
export function verifyManifest(m){
 if(m?.phase!=='isolated-preparation')throw Error('Wrong release phase');
 if(m.productionWritesAllowed!==false)throw Error('Unsafe production writes setting');
 if(m.productionReleaseApproved!==false)throw Error('Release may not be pre-approved');
 if(!/^[a-f0-9]{40}$/.test(m.sourceBaseline||''))throw Error('Unknown source baseline');
 const required=['device-identity','security','community-gallery','home-board','whale-gacha'];
 if(!Array.isArray(m.streams)||m.streams.length!==required.length||new Set(m.streams.map(x=>x.key)).size!==required.length)throw Error('Incomplete or duplicate components');
 for(const key of required)if(!m.streams.some(x=>x.key===key && typeof x.branch==='string' && x.branch.length>0))throw Error('Missing component: '+key);
 const gateKeys=['isolatedTestData','separatePreviewCredentials','signedDeviceIdentityIntegrated','allAutomatedTestsPassed','mobileBrowserTestsPassed','rollbackVerified','ownerApprovedRelease'];
 for(const key of gateKeys)if(typeof m.gates?.[key]!=='boolean')throw Error('Missing gate: '+key);
 return {valid:true,readyToIntegrate:m.streams.every(x=>x.ready===true)&&gateKeys.every(x=>m.gates[x]===true)};
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
 const v=verifyManifest(manifest);
 console.log('Pre-release manifest valid. Integration gate:',v.readyToIntegrate?'READY':'BLOCKED');
}
