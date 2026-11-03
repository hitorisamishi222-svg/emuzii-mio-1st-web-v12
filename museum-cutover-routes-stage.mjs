// Draft-only preview of the planned ONE-TIME public frontpage cutover.
// This module does NOT edit vercel.json, deploy, merge, or contact a server.
// The archival index.html source, check-in API, DB tables, attendance and
// prize data remain present for future event reuse and rollback.
import {createHash} from 'node:crypto';

const fail=code=>{throw Error('MUSEUM_ROUTE_'+code)};
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clone=x=>structuredClone(x);
const route=x=>x&&typeof x.src==='string'&&typeof x.dest==='string';
const build=x=>x&&typeof x.src==='string'&&typeof x.use==='string';
export function planMioMuseumOneTimeRoutes(config){
 if(!config||typeof config!=='object'||Array.isArray(config)||
    !Array.isArray(config.routes)||!Array.isArray(config.builds)||
    !config.routes.every(route)||!config.builds.every(build))
  fail('CONFIG_INVALID');
 const root=config.routes.filter(r=>r.src==='/');
 const originalIndex=config.routes.filter(r=>r.src==='/index.html');
 if(root.length!==1||root[0].dest!=='/index.html'||originalIndex.length!==0)
  fail('ROOT_CONFLICT');
 if(config.routes.filter(r=>r.src==='/museum.html'&&r.dest==='/museum.html').length!==1||
    !config.builds.some(b=>b.src==='museum.html'&&b.use==='@vercel/static')||
    !config.builds.some(b=>b.src==='index.html'&&b.use==='@vercel/static'))
  fail('MUSEUM_NOT_BUILT');
 // No wildcard, API, attendance or check-in routes can be removed or changed.
 const original=clone(config),preview=clone(config);
 const i=preview.routes.findIndex(r=>r.src==='/');
 preview.routes[i].dest='/museum.html';
 // Prevent direct old index.html URL from showing the retired attendance page
 // while preserving original index.html, APIs and records in the repository.
 // Explicit redirect comes before the wildcard fallback. The final release
 // review must verify actual Vercel routing before any production promotion.
 preview.routes.splice(i,0,{
  src:'/index.html',status:307,headers:{Location:'/museum.html'}
 });
 for(const current of original.routes){
  if(current.src==='/')continue;
  if(!preview.routes.some(x=>JSON.stringify(x)===JSON.stringify(current)))
   fail('EXISTING_ROUTE_CHANGED');
 }
 if(JSON.stringify(original.builds)!==JSON.stringify(preview.builds))
  fail('BUILD_CHANGED');
 if(!preview.routes.some(x=>x.src==='/api/checkin'&&x.dest==='/api-checkin.js')||
    !preview.builds.some(x=>x.src==='api-checkin.js'))
  fail('LEGACY_CODE_MISSING');
 const restore=clone(original);
 return Object.freeze({
  proposalOnly:true,
  canDeploy:false,
  originalSha256:sha(original),
  proposedSha256:sha(preview),
  routeChanges:Object.freeze([
   Object.freeze({path:'/',before:'/index.html',after:'/museum.html'}),
   Object.freeze({path:'/index.html',before:'legacy direct file',after:'307 redirect to /museum.html'})
  ]),
  proposedConfig:preview,
  rollbackConfig:restore,
  legacySourcesKept:true,
  participantDataTouched:false
 });
}
