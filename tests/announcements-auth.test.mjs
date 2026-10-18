// Run from repository root: node --test tests/announcements-auth.test.mjs
// Static regression checks only. These do not substitute for approved-device E2E tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const api=readFileSync('api-announcements.js','utf8');
const passkey=readFileSync('api-gallery-passkey.js','utf8');
const ui=readFileSync('announcements-manage.html','utf8');

test('announcement management uses gallery-scoped session cookies',()=>{
 assert.match(ui,/const api='\/api\/gallery\/announcements'/);
 assert.match(api,/mio_gallery_session/);
 assert.match(api,/mio_gallery_device/);
});
test('writes require approved device and unexpired active admin session',()=>{
 assert.match(api,/s\.expires_at>now\(\)/);
 assert.match(api,/s\.revoked_at IS NULL/);
 assert.match(api,/d\.status='approved'/);
 assert.match(api,/u\.role IN \('owner','admin'\)/);
 assert.match(api,/if\(!admin\)return fail\(res,401/);
});
test('mutations use revision checks and require same-origin JSON',()=>{
 assert.match(api,/req\.headers\.origin/);
 assert.match(api,/ITEM_CHANGED_RELOAD/);
 assert.match(api,/AND revision=\$[0-9]/);
});
test('passkey verification requires user verification and approved device',()=>{
 assert.match(passkey,/requireUserVerification:true/);
 assert.match(passkey,/approved=d\.rows\[0\]\.status==='approved'/);
 assert.match(passkey,/if\(approved\)\{await c\.query/);
});
