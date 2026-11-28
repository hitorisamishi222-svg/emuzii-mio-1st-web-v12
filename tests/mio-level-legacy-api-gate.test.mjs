import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {legacyFeatureGateEnabled,authorizeLegacyApiFeature} from '../mio-level-legacy-api-gate-vnext.mjs';

const token='a'.repeat(64),id='MIO-W-'+'c'.repeat(24);
const session={id,token};
const row={web_id:id,master_id:'MIO-0017',token_hash:createHash('sha256').update(token).digest('hex'),
 generation:4,state:'active',level:2,member_until:null,device_thumbprint:'sha256:'+'b'.repeat(64),
 account_generation:4,account_status:'active',account_level:2,account_member_until:null};
const db={async query(sql,args){assert.match(sql,/mio_level_legacy_sessions_v1/);assert.equal(args[0],id);return {rows:[row]};}};

test('feature gate requires the explicit production release flag',()=>{
 assert.equal(legacyFeatureGateEnabled({VERCEL_ENV:'production',MIO_LEVEL_ADMIN_RELEASE:'vnext-verified'}),true);
 assert.equal(legacyFeatureGateEnabled({VERCEL_ENV:'preview',MIO_LEVEL_ADMIN_RELEASE:'vnext-verified'}),false);
 assert.equal(legacyFeatureGateEnabled({VERCEL_ENV:'production',MIO_LEVEL_ADMIN_RELEASE:'preview-synthetic'}),false);
});

test('GAS identity mismatch stops before querying the level database',async()=>{
 await assert.rejects(authorizeLegacyApiFeature({db:{query(){throw Error('must not query')}},session,
  gasStatus:{participantId:'MIO-W-'+'d'.repeat(24)},resource:'attendance'}),/GAS_IDENTITY_MISMATCH/);
});

test('Lv2 legacy session can access attendance but not membership gacha',async()=>{
 const approved={participantId:id};
 const attendance=await authorizeLegacyApiFeature({db,session,gasStatus:approved,resource:'attendance'});
 assert.equal(attendance.level,2);
 await assert.rejects(authorizeLegacyApiFeature({db,session,gasStatus:approved,resource:'member_gacha'}),/FEATURE_LEVEL_REQUIRED/);
});

test('missing database fails closed after explicit production release',async()=>{
 await assert.rejects(authorizeLegacyApiFeature({db:null,session,gasStatus:{participantId:id},resource:'attendance'}),/LEVEL_AUTH_UNAVAILABLE/);
});
