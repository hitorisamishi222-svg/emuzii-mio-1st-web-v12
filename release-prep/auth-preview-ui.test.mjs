import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function page(name) {
 const html=readFileSync(new URL('../'+name,import.meta.url),'utf8');
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 assert.ok(scripts.length>0,name+' must contain behavior');
 for(const source of scripts) new vm.Script(source,{filename:name});
 return html;
}

test('TEST login screen JS is valid, fail-closed, and has device navigation',()=>{
 const html=page('login-recovery-demo.html');
 assert.match(html,/fetch\('\/test-auth\/me'/);
 assert.match(html,/fetch\('\/test-auth\/login'/);
 assert.match(html,/if\(!type\.includes\('application\/json'\)\)/);
 assert.match(html,/device-sessions-preview\.html/);
 assert.match(html,/本番アカウントは使用しないでください/);
 assert.doesNotMatch(html,/fetch\(['"]https?:\/\//);
});

test('TEST device controls are valid and require confirmation',()=>{
 const html=page('device-sessions-preview.html');
 for(const route of ['me','devices','revoke-device','logout','logout-all'])
  assert.ok(html.includes('/test-auth/'+route),'missing TEST route: '+route);
 assert.match(html,/confirm\(/);
 assert.match(html,/document\.getElementById\('activeDevices'\)\.hidden=true/);
 assert.match(html,/replaceChildren\(\)/);
 assert.match(html,/credentials:'same-origin'/);
 assert.doesNotMatch(html,/fetch\(['"]https?:\/\//);
});

test('browser API probe explains disabled TEST environment and does not claim false auth failures',()=>{
 const html=page('public/test-auth-browser-check.html');
 assert.match(html,/test_environment_not_ready/);
 assert.match(html,/環境未設定：テスト未実行（0\/5）/);
 assert.match(html,/credentials:'same-origin'/);
 assert.doesNotMatch(html,/fetch\(['"]https?:\/\//);
});
