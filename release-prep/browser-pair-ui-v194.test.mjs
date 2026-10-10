import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const claimScript=read('browser-connect.js');
const issueScript=read('browser-pair-candidate.js');
const markup=read('browser-connect.html');
const home=read('index.html');
const app=read('app.js');

function claimFixture(fragment,response={ok:true}){
 const status={textContent:''};
 const events={};
 const button={disabled:true,addEventListener(name,fn){events[name]=fn}};
 const location={hash:fragment,pathname:'/browser-connect.html',destination:null,replace(path){this.destination=path}};
 const history={replaceState(...args){history.args=args}};
 const calls=[];
 const document={getElementById(id){return id==='status'?status:id==='claim'?button:null}};
 const fetch=async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>response}};
 vm.runInNewContext(claimScript,{document,location,history,fetch,Error,JSON});
 return {status,events,button,location,history,calls};
}
test('claim page visibly describes the link and never injects a login secret into markup',()=>{
 assert.match(markup,/id="claim"/);
 assert.match(markup,/id="status"/);
 assert.match(markup,/browser-connect\.js/);
 assert.doesNotMatch(markup,/#key=[a-f0-9]{64}/);
});
test('invalid or missing link is rejected before a network call',()=>{
 for(const hash of ['','#key=other','#key='+'a'.repeat(63),'#key='+'z'.repeat(64)]){
  const x=claimFixture(hash);
  assert.equal(x.button.disabled,true);
  assert.equal(x.calls.length,0);
  assert.deepEqual(Array.from(x.history.args||[]).slice(1),[null,'/browser-connect.html']);
 }
});
test('valid link requires an explicit tap and removes hash from address bar',async()=>{
 const secret='a'.repeat(64),x=claimFixture('#key='+secret);
 assert.equal(x.button.disabled,false);
 assert.equal(x.calls.length,0,'opening the link alone does not claim identity');
 assert.deepEqual(Array.from(x.history.args).slice(1),[null,'/browser-connect.html']);
 await x.events.click();
 assert.equal(x.calls.length,1);
 const call=x.calls[0];
 assert.equal(call.path,'/api/browser-pair/claim');
 assert.equal(call.options.method,'POST');
 assert.equal(call.options.credentials,'same-origin');
 assert.equal(JSON.parse(call.options.body).key,secret);
 assert.equal(x.button.disabled,true);
 assert.equal(x.location.destination,'/');
});
test('failed server identity response never redirects to existing history',async()=>{
 const secret='b'.repeat(64),x=claimFixture('#key='+secret,{ok:false,error:'期限切れです'});
 await x.events.click();
 assert.equal(x.location.destination,null);
 assert.match(x.status.textContent,/期限切れ/);
});
test('only server-confirmed approved users see the pairing panel',()=>{
 assert.match(home,/id="browserPair"[^>]+hidden/);
 assert.match(app,/browserPair'\)\.hidden=d\.status!=='承認済み'/);
 assert.match(app,/browserPair'\)\.hidden=true/);
});
function issueFixture(){
 const eventHandlers=new Map(),out={hidden:true},field={value:''},status={textContent:''};
 const makeButton=name=>({disabled:false,addEventListener(ev,fn){eventHandlers.set(name+':'+ev,fn)}});
 const buttons={'#pairCreate':makeButton('create'),'#pairCopy':makeButton('copy'),'#pairShare':makeButton('share')};
 const document={querySelector(key){return buttons[key]||({'#pairOut':out,'#pairLink':field,'#pairStatus':status})[key]||null}};
 const copy=[];
 const navigator={clipboard:{async writeText(v){copy.push(v)}},share:async()=>{}};
 const calls=[];
 const fetch=async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>({ok:true,url:'https://demo.example/browser-connect.html#key='+'c'.repeat(64)})}};
 vm.runInNewContext(issueScript,{document,navigator,fetch});
 return {handlers:eventHandlers,buttons,field,out,status,copy,calls};
}
test('registered browser issues a link only after click, and supports copy',async()=>{
 const x=issueFixture();
 assert.equal(x.calls.length,0);
 await x.handlers.get('create:click')();
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].path,'/api/browser-pair/create');
 assert.equal(x.calls[0].options.credentials,'same-origin');
 assert.equal(x.out.hidden,false);
 assert.match(x.field.value,/#key=[a-f0-9]{64}$/);
 await x.handlers.get('copy:click')();
 assert.equal(x.copy[0],x.field.value);
});
test('preview deliberately isolates all API calls from production',()=>{
 const v=JSON.parse(read('vercel.json'));
 assert(v.routes.some(x=>x.src==='^/api(?:/.*)?$'&&x.status===404));
 assert(!v.builds.some(x=>x.use==='@vercel/node'));
 assert(v.routes.some(x=>x.src==='^/$'&&x.dest==='/browser-pair-preview.html'));
});
test('candidate production routing manifest includes new APIs only as review artifact',()=>{
 const v=JSON.parse(read('release-prep/vercel-live-v194.json'));
 assert(v.routes.some(x=>x.src==='/api/browser-pair/create'&&x.dest==='/api-browser-pair-create.js'));
 assert(v.routes.some(x=>x.src==='/api/browser-pair/claim'&&x.dest==='/api-browser-pair-claim.js'));
 assert(v.builds.some(x=>x.src==='api-browser-pair-create.js'&&x.use==='@vercel/node'));
});
