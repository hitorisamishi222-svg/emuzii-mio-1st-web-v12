import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAuthorized,canUploadMusic,validateMusicMetadata} from './v2-security-policy.mjs';
const member={verified:true,role:'member',membershipExpiresAt:2000};
test('deny anonymous, forged role, and expired memberships',()=>{
  assert.deepEqual(assertAuthorized(null,'admin'),{ok:false,status:401});
  assert.equal(assertAuthorized({verified:false,role:'owner'},'admin').status,401);
  assert.equal(assertAuthorized({verified:true,role:'participant'},'admin').status,403);
  assert.equal(assertAuthorized({verified:true,role:'operator'},'admin').status,403);
  assert.equal(assertAuthorized({verified:true,role:'owner'},'admin').status,200);
  assert.equal(canUploadMusic(member,1000),true);
  assert.equal(canUploadMusic(member,2000),false);
  assert.equal(canUploadMusic({...member,role:'owner'},1000),false);
});
test('validate audio metadata and reject invalid files',()=>{
  const valid={title:'Original song',artist:'Artist',fileName:'track.MP3',fileSize:1024};
  assert.equal(validateMusicMetadata(valid).ok,true);
  assert.equal(validateMusicMetadata({...valid,fileName:'x.exe'}).ok,false);
  assert.equal(validateMusicMetadata({...valid,fileSize:31*1024*1024}).ok,false);
  assert.equal(validateMusicMetadata({...valid,artworkMime:'image/svg+xml',artworkSize:100}).ok,false);
});
