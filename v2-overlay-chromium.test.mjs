import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const fixture=readFileSync(new URL('./testdata/overlay-chromium.fixture.html',import.meta.url),'utf8');
const panel=readFileSync(new URL('./asahi-panel-v3.js',import.meta.url),'utf8');
test('real headless browser verifies panel select/copy/range/paste/drag/close/reopen',()=>{
 const chrome=['/usr/bin/chromium','/usr/bin/google-chrome'].find(x=>spawnSync('test',['-x',x]).status===0);
 if(!chrome)return test.skip('Chrome unavailable on this runner');
 const dir=mkdtempSync(join(tmpdir(),'asahi-overlay-'));
 const content=fixture.replace('<script src="../asahi-panel-v3.js"></script>','<script>'+panel+'</script>');
 const file=join(dir,'overlay.html');
 writeFileSync(file,content);
 try{
 const cp=spawnSync(chrome,['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--virtual-time-budget=4000','--dump-dom','file://'+file],{encoding:'utf8',timeout:25000,maxBuffer:4e6});
 assert.equal(cp.status,0,'Chromium exited with '+cp.status+': '+cp.stderr.slice(-500));
 const match=cp.stdout.match(/<pre id="test-output">([\s\S]*?)<\/pre>/);
 assert.ok(match,'browser output absent: '+cp.stdout.slice(-500));
 const items=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&'));
 assert.ok(items.length>=9,'not all browser scenarios executed');
 assert.deepEqual(items.filter(x=>!x.ok),[],JSON.stringify(items,null,2));
 }finally{rmSync(dir,{recursive:true,force:true});}
});