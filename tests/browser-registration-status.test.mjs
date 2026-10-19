import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('async function refresh(){');
const end=source.indexOf("\n$('register')?.addEventListener",start);
assert.ok(start>=0 && end>start,'Could not locate original special-site status flow');
const refreshSource=source.slice(start,end);

function browser({knownSession=false,status=502}={}){
  const elements=Object.fromEntries(
    ['counts','gachaDetail','refresh','registerButton','register','personal'].map(id=>
      [id,{hidden:false,disabled:false,textContent:''}])
  );
  const notices=[],requests=[];
  const context={
    $:id=>elements[id],
    message:(s,err)=>notices.push({message:s,error:err}),
    post:async path=>{
      requests.push(path);
      if(status===200)return {ok:true,status:'承認済み'};
      const error=Error('Synthetic offline response');
      error.status=status;
      throw error;
    },
    display:()=>{context.wasDisplayed=true}
  };
  const api=vm.runInNewContext(
    'let registered='+JSON.stringify(knownSession)+';\n'+refreshSource+
      '\n({run:refresh,registered:()=>registered})',
    context
  );
  return {api,elements,notices,requests,context};
}

test('temporary status outage does not turn an existing user into new registration',async()=>{
  const app=browser({knownSession:true,status:502});
  const ok=await app.api.run();
  assert.equal(ok,false);
  assert.equal(app.api.registered(),true);
  assert.equal(app.elements.registerButton.textContent,'参加状況を再確認');
  assert.equal(app.elements.personal.hidden,true);
  assert.equal(app.requests.length,1);
  assert.equal(app.requests[0],'/api/status');
});

test('a real no-session response permits the existing registration flow',async()=>{
  const app=browser({knownSession:true,status:401});
  const ok=await app.api.run();
  assert.equal(ok,false);
  assert.equal(app.api.registered(),false);
});

test('an anonymous user remains anonymous after a transient status outage',async()=>{
  const app=browser({knownSession:false,status:502});
  const ok=await app.api.run();
  assert.equal(ok,false);
  assert.equal(app.api.registered(),false);
});

test('a successful status refresh retains the original web session',async()=>{
  const app=browser({knownSession:true,status:200});
  const ok=await app.api.run();
  assert.equal(ok,true);
  assert.equal(app.api.registered(),true);
  assert.equal(app.context.wasDisplayed,true);
});
