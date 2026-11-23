const {readFileSync}=require('node:fs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const src=readFileSync(__dirname+'/../gacha-passkey-ui.js','utf8');
const code='synthetic-admin-code-123456';
async function harness({registerError,verifyError,authenticated=false}={}){
 const elements={passkeyStatus:{textContent:''},passkeyLogin:{textContent:'Face IDでログイン'},passkeyRegister:{textContent:'この端末のFace IDを登録'},code:{value:code}};
 const actions=[],events=[];let clock=0;
 const credential={toJSON:()=>({id:'synthetic',response:{}})};
 const options={challenge:'YWJj',user:{id:'ZGVm'},authenticatorSelection:{userVerification:'required'}};
 const context={document:{getElementById:id=>elements[id]},window:{isSecureContext:true},
  PublicKeyCredential:{parseCreationOptionsFromJSON:o=>o,parseRequestOptionsFromJSON:o=>o},
  navigator:{credentials:{create:async o=>{events.push('create');assert.equal(o.publicKey.authenticatorSelection.userVerification,'required');if(registerError)throw registerError;return credential},get:async()=>{events.push('get');return credential}}},
  fetch:async (url,o)=>{assert.equal(url,'/api/gacha-passkey');const d=JSON.parse(o.body);actions.push(d.action);events.push(d.action);
   if(d.action==='registerOptions'||d.action==='registerVerify')assert.equal(d.code,code);
   const failed=verifyError&&d.action==='registerVerify';
   return {ok:!failed,json:async()=>failed?{ok:false,error:'invalid credential'}:{ok:true,options,authenticated}}},
  $:id=>elements[id],code:'',snapshot:null,request:async()=>({ok:true}),redraw:()=>events.push('redraw'),
  Date:{now:()=>clock},atob,btoa,Uint8Array,console};
 vm.runInNewContext(src,context);await new Promise(setImmediate);
 return {elements,actions,events,clock:v=>clock=v};
}
test('registration: second fresh click starts native create synchronously; verification follows',async()=>{
 const h=await harness();
 await h.elements.passkeyRegister.onclick();
 assert.deepEqual(h.actions,['status','registerOptions']);
 assert.match(h.elements.passkeyStatus.textContent,/準備完了/);
 const promise=h.elements.passkeyRegister.onclick();
 assert.equal(h.events.at(-1),'create');
 assert.equal(h.elements.passkeyRegister.disabled,true);
 await promise;
 assert.deepEqual(h.actions,['status','registerOptions','registerVerify']);
 assert.match(h.elements.passkeyStatus.textContent,/ログインしました/);
 assert.equal(h.elements.code.value,'');
});
test('login: second click invokes get before network; existing session semantics preserved',async()=>{
 const h=await harness();
 await h.elements.passkeyLogin.onclick();
 assert.deepEqual(h.actions,['status','loginOptions']);
 const promise=h.elements.passkeyLogin.onclick();
 assert.equal(h.events.at(-1),'get');await promise;
 assert.deepEqual(h.actions,['status','loginOptions','loginVerify']);
});
test('expired challenge is replaced without invoking native credential operation',async()=>{
 const h=await harness();await h.elements.passkeyRegister.onclick();h.clock(46000);
 await h.elements.passkeyRegister.onclick();
 assert.deepEqual(h.actions,['status','registerOptions','registerOptions']);
 assert.equal(h.events.includes('create'),false);
});
test('cancelled native ceremony never sends registerVerify and controls recover',async()=>{
 const e=Object.assign(Error('cancelled'),{name:'NotAllowedError'});
 const h=await harness({registerError:e});
 await h.elements.passkeyRegister.onclick();await h.elements.passkeyRegister.onclick();
 assert.deepEqual(h.actions,['status','registerOptions']);assert.match(h.elements.passkeyStatus.textContent,/端末認証/);
 assert.equal(h.elements.passkeyRegister.disabled,false);
 assert.equal(h.elements.passkeyRegister.textContent,'この端末のFace IDを登録');
});
test('server rejection is distinguished from native authentication failure',async()=>{
 const h=await harness({verifyError:true});
 await h.elements.passkeyRegister.onclick();await h.elements.passkeyRegister.onclick();
 assert.match(h.elements.passkeyStatus.textContent,/サーバー認証確認/);
 assert.equal(h.events.includes('redraw'),false);
});
test('short code cannot start registration',async()=>{
 const h=await harness();h.elements.code.value='short';
 await h.elements.passkeyRegister.onclick();
 assert.deepEqual(h.actions,['status']);assert.match(h.elements.passkeyStatus.textContent,/管理者コード/);
});
test('simultaneous presses cannot start multiple ceremonies',async()=>{
 const h=await harness();
 await Promise.all([h.elements.passkeyRegister.onclick(),h.elements.passkeyRegister.onclick()]);
 assert.deepEqual(h.actions,['status','registerOptions']);
 await Promise.all([h.elements.passkeyRegister.onclick(),h.elements.passkeyRegister.onclick()]);
 assert.deepEqual(h.actions,['status','registerOptions','registerVerify']);
});
