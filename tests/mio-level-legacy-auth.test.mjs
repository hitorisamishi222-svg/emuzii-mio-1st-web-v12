import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {authorizeLegacyFeature} from '../mio-level-legacy-auth-vnext.mjs';

const token='a'.repeat(64);
const thumbprint='sha256:'+'b'.repeat(64);
const now=new Date('2026-11-27T00:00:00.000Z');
function dbFor(row){return {async query(sql,args){
 assert.match(sql,/mio_level_legacy_sessions_v1/);
 assert.equal(args[0],'MIO-W-'+'c'.repeat(24));
 return {rows:row?[row]:[]};
}}}
function session(){return {id:'MIO-W-'+'c'.repeat(24),token};}
function row(overrides={}){return {
 web_id:session().id,master_id:'MIO-0017',token_hash:createHash('sha256').update(token).digest('hex'),
 generation:4,state:'active',level:2,member_until:null,device_thumbprint:thumbprint,
 account_generation:4,account_status:'active',account_level:2,account_member_until:null,
 ...overrides
};}

test('public resources do not require a legacy session or database lookup',async()=>{
 const result=await authorizeLegacyFeature({db:{query(){throw Error('unexpected lookup')}},session:null,resource:'public_gallery',now});
 assert.deepEqual(result,{managed:false,allowed:true,reason:'PUBLIC_RESOURCE'});
});

test('pre-vNext legacy sessions are delegated to the existing GAS authentication path',async()=>{
 const result=await authorizeLegacyFeature({db:dbFor(null),session:session(),resource:'attendance',now});
 assert.deepEqual(result,{managed:false,allowed:true,reason:'LEGACY_GAS_ONLY'});
});

test('active mapped level-2 session can use attendance but not member gacha',async()=>{
 const db=dbFor(row());
 const allowed=await authorizeLegacyFeature({db,session:session(),resource:'attendance',now});
 const denied=await authorizeLegacyFeature({db,session:session(),resource:'member_gacha',now});
 assert.equal(allowed.allowed,true);
 assert.equal(allowed.level,2);
 assert.equal(denied.allowed,false);
 assert.equal(denied.reason,'LEVEL_REQUIRED');
});

test('token mismatch, revoked account, stale generation and uncommitted cutover fail closed',async()=>{
 for(const [overrides,reason] of [
  [{token_hash:'f'.repeat(64)},'LEGACY_SESSION_MISMATCH'],
  [{account_status:'revoked'},'ACCOUNT_REVOKED'],
  [{account_generation:5},'LEGACY_SESSION_STALE'],
  [{state:'pending'},'CUTOVER_NOT_COMMITTED']
 ]){
  const result=await authorizeLegacyFeature({db:dbFor(row(overrides)),session:session(),resource:'attendance',now});
  assert.equal(result.allowed,false);
  assert.equal(result.reason,reason);
 }
});

test('expired member level falls back to fan level on mapped session',async()=>{
 const result=await authorizeLegacyFeature({db:dbFor(row({level:3,account_level:3,
  member_until:'2026-11-01T00:00:00.000Z',account_member_until:'2026-11-01T00:00:00.000Z'})),
  session:session(),resource:'member_gallery',now});
 assert.equal(result.allowed,false);
 assert.equal(result.reason,'LEVEL_REQUIRED');
});

test('unknown resource and malformed session fail closed',async()=>{
 const unknown=await authorizeLegacyFeature({db:dbFor(row()),session:session(),resource:'admin'});
 const malformed=await authorizeLegacyFeature({db:dbFor(row()),session:{id:'MIO-W-invalid',token},resource:'attendance'});
 assert.equal(unknown.reason,'UNKNOWN_RESOURCE');
 assert.equal(malformed.reason,'LEGACY_SESSION_REQUIRED');
});
