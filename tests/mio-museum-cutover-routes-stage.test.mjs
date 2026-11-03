import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planMioMuseumOneTimeRoutes} from '../museum-cutover-routes-stage.mjs';

const raw=()=>JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const plan=()=>planMioMuseumOneTimeRoutes(raw());
const reject=(config,code)=>assert.throws(()=>planMioMuseumOneTimeRoutes(config),
 new RegExp('MUSEUM_ROUTE_'+code));

test('one-time cutover proposal changes ONLY the root and direct old-index entry',()=>{
 const actual=raw(),result=plan();
 assert.equal(result.proposalOnly,true);
 assert.equal(result.canDeploy,false);
 assert.equal(result.participantDataTouched,false);
 assert.equal(result.legacySourcesKept,true);
 assert.equal(result.proposedConfig.routes.find(x=>x.src==='/').dest,'/museum.html');
 assert.deepEqual(result.proposedConfig.routes.find(x=>x.src==='/index.html'),
  {src:'/index.html',status:307,headers:{Location:'/museum.html'}});
 assert.equal(actual.routes.find(x=>x.src==='/').dest,'/index.html',
  'source file is still in old state, not updated in-place');
});
test('the candidate retains every existing API, static, administration and check-in route',()=>{
 const actual=raw(),candidate=plan().proposedConfig;
 assert.deepEqual(candidate.builds,actual.builds);
 assert.deepEqual(candidate.headers,actual.headers);
 const unchanged=actual.routes.filter(x=>x.src!=='/');
 for(const x of unchanged)assert.ok(candidate.routes.some(y=>
  JSON.stringify(x)===JSON.stringify(y)),'missing route '+x.src);
 assert.deepEqual(candidate.routes.filter(x=>x.src.startsWith('/api/')),
  actual.routes.filter(x=>x.src.startsWith('/api/')));
});
test('legacy participant, attendance and gacha entry code remains in the build even if hidden from museum nav',()=>{
 const candidate=plan().proposedConfig;
 for(const src of ['index.html','api-checkin.js','api-gacha.js',
  'api-register.js','gallery.html']){
  assert.ok(candidate.builds.some(x=>x.src===src),'missing protected source '+src);
 }
 assert.ok(candidate.routes.some(x=>x.src==='/api/checkin'&&x.dest==='/api-checkin.js'));
});
test('reversing the cutover can recover the identical original route configuration',()=>{
 const actual=raw(),result=plan();
 assert.deepEqual(result.rollbackConfig,actual);
 assert.equal(result.originalSha256.length,64);
 assert.equal(result.proposedSha256.length,64);
 assert.notEqual(result.originalSha256,result.proposedSha256);
 assert.equal(result.rollbackConfig.routes.find(x=>x.src==='/').dest,'/index.html');
});
test('plan is pure and never modifies the checked-in Vercel config',()=>{
 const actual=raw(),copy=structuredClone(actual);
 const result=planMioMuseumOneTimeRoutes(actual);
 result.proposedConfig.routes[0].src='/tampered';
 assert.deepEqual(actual,copy);
 assert.deepEqual(result.rollbackConfig,copy);
});
test('root already switched, duplicated or diverted is never silently rewritten',()=>{
 for(const dest of ['/museum.html','/maintenance.html']){
  const x=raw();x.routes.find(r=>r.src==='/').dest=dest;
  reject(x,'ROOT_CONFLICT');
 }
 const dup=raw();dup.routes.push({src:'/',dest:'/index.html'});
 reject(dup,'ROOT_CONFLICT');
 const direct=raw();direct.routes.unshift({src:'/index.html',dest:'/index.html'});
 reject(direct,'ROOT_CONFLICT');
});
test('missing gallery page, old-page source or protected check-in route stops the proposal',()=>{
 for(const src of ['museum.html','index.html']){
  const x=raw();x.builds=x.builds.filter(b=>b.src!==src);
  reject(x,'MUSEUM_NOT_BUILT');
 }
 const missing=raw();missing.routes=missing.routes.filter(x=>x.src!=='/museum.html');
 reject(missing,'MUSEUM_NOT_BUILT');
 const gone=raw();gone.routes=gone.routes.filter(x=>x.src!=='/api/checkin');
 reject(gone,'LEGACY_CODE_MISSING');
});
test('no source file or endpoint is deployed by the route planner itself',()=>{
 const source=readFileSync(new URL('../museum-cutover-routes-stage.mjs',import.meta.url),'utf8');
 const current=raw();
 assert.doesNotMatch(source,/export default|process\.env|deploy\s*\(|fetch\s*\(|INSERT INTO|UPDATE\s|DELETE FROM/i);
 assert.equal(current.routes.find(x=>x.src==='/').dest,'/index.html');
 assert.equal(current.builds.some(x=>x.src==='museum-cutover-routes-stage.mjs'),false);
});
