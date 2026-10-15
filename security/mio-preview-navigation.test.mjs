import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const html=readFileSync(new URL('../integrated-live-demo.html',import.meta.url),'utf8');
test('all preview navigation targets exist and stay local HTML pages',()=>{
 const links=[...html.matchAll(/<button\s+data-page="([^"]+)"/g)].map(x=>x[1]);
 assert.ok(links.length>=10,'expected full preview navigation');
 for(const path of links){
  assert.match(path,/^[a-z0-9-]+\.html$/i);
  assert.ok(existsSync(new URL('../'+path,import.meta.url)),path+' missing');
 }
});
test('preview navigation does not point to production root or backend',()=>{
 assert.match(html,/id="frame"[^>]*src="home-portrait-next\.html"/);
 assert.doesNotMatch(html,/<button\s+data-page="(?:index|gacha)\.html"/);
 assert.match(html,/ガチャ実抽選は停止中/);
});
