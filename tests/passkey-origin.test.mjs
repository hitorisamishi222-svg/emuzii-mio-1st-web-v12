import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('api-gallery-passkey.js','utf8');
test('preview deployments cannot use production passkey relying-party ID',()=>{
 assert.match(source,/if\(host!=='emuzii-mio-1st-web-v12\.vercel\.app'\)return error\(res,403,'ORIGIN_NOT_ALLOWED'\)/);
 assert.match(source,/rpID:host/);
 assert.match(source,/expectedOrigin:'https:\/\/'\+host/);
 assert.match(source,/expectedRPID:host/);
});
test('cross-origin passkey writes are rejected',()=>{
 assert.match(source,/req\.headers\.origin!=='https:\/\/'\+host/);
 assert.match(source,/REQUEST_ORIGIN_INVALID/);
});
