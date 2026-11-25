import test from 'node:test';
import assert from 'node:assert/strict';
import {isSyntheticPreview,isSyntheticTestId,syntheticRoster,MIO_PREVIEW_BRANCH} from '../mio-level-preview-scope.mjs';

const host='mio-preview.vercel.app';
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:MIO_PREVIEW_BRANCH,
 VERCEL_URL:host,MIO_LEVEL_ADMIN_RELEASE:'preview-synthetic',MIO_LEVEL_PREVIEW_SYNTHETIC:'1',
 MIO_LEVEL_DATABASE_URL:'postgresql://test:secret@ep-dry-leaf-b7b7ph6q.c-13.us-east-1.aws.neon.tech/db'};
test('only the named Preview branch, host, origin, and isolated Neon branch are accepted',()=>{
 assert.equal(isSyntheticPreview(env,{host,origin:`https://${host}`}),true);
 for(const [key,value] of [['VERCEL_ENV','production'],['VERCEL_GIT_COMMIT_REF','main'],
   ['MIO_LEVEL_ADMIN_RELEASE','vnext-verified'],['MIO_LEVEL_PREVIEW_SYNTHETIC','0'],
   ['MIO_LEVEL_DATABASE_URL','postgresql://test:secret@ep-production.c-13.us-east-1.aws.neon.tech/db']]){
  assert.equal(isSyntheticPreview({...env,[key]:value},{host,origin:`https://${host}`}),false,key);
 }
 assert.equal(isSyntheticPreview(env,{host:'attacker.vercel.app',origin:'https://attacker.vercel.app'}),false);
 assert.equal(isSyntheticPreview(env,{host,origin:'https://evil.example'}),false);
});
test('synthetic roster and IDs cannot select real participants',()=>{
 assert.equal(isSyntheticTestId('MIO-9998'),true);
 assert.equal(isSyntheticTestId('MIO-0017'),false);
 assert.deepEqual(syntheticRoster().roster.map(x=>x.mioId),['MIO-9998','MIO-9999']);
});
