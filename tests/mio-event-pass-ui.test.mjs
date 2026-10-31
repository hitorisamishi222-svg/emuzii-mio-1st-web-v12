import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../mio-event-pass-ui.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../event-pass.html',import.meta.url),'utf8');
async function drain(){for(let i=0;i<7;i++)await new Promise(resolve=>setImmediate(resolve))}
function page(search='?event=mio-open-2026'){
 const el={},calls=[],responses=[];
 for(const id of ['eventPassInfo','eventPassEmail','eventPassCode','eventPassInvite',
  'eventPassSendCode','eventPassVerify','eventPassIssue','eventPassEventLabel',
  'eventPassMessage','eventPassTicket']){
  el[id]={value:'',disabled:true,hidden:id==='eventPassTicket',textContent:'',
   onclick:null,addEventListener(type,fn){this['on'+type]=fn},
   click(){return this.onclick?.()}};
 }
 const location={search};
 const fetch=async(path,params)=>{
  const input=JSON.parse(params.body);calls.push({path,input});
  const response=responses.shift()||{status:200,data:{ok:true,allowed:false}};
  return {ok:response.status<400,status:response.status,json:async()=>response.data};
 };
 vm.runInNewContext(js,{location,document:{getElementById:id=>el[id]},URLSearchParams,fetch});
 return {el,calls,responses,click:async id=>{el[id].click();await drain()}};
}
test('six-digit code verification automatically issues event pass, no repeated registration',async()=>{
 const p=page();
 p.responses.push(
  {status:200,data:{ok:true,allowed:false}},
  {status:202,data:{ok:true,status:'code_sent'}},
  {status:200,data:{ok:true,status:'email_verified'}},
  {status:200,data:{ok:true,status:'issued',passId:'33333333-3333-4333-8333-333333333333'}}
 );
 await drain();
 p.el.eventPassEmail.value='member@gmail.com';
 p.el.eventPassCode.value='123456';
 await p.click('eventPassSendCode');
 await p.click('eventPassVerify');
 assert.match(p.el.eventPassMessage.textContent,/参加証を発行しました/);
 assert.match(p.el.eventPassTicket.textContent,/33333333/);
 assert.equal(p.el.eventPassTicket.hidden,false);
 assert.deepEqual(p.calls.map(x=>x.input.action),['check','start','verify','issue']);
 assert.equal(p.calls.some(x=>/register|gacha|grant/.test(x.path)),false);
 assert.equal(p.calls[3].input.eventId,'mio-open-2026');
});
test('revisit uses stored signed session to report existing pass without issuing new one',async()=>{
 const p=page();
 p.responses.push({status:200,data:{ok:true,allowed:true}});
 await drain();
 assert.match(p.el.eventPassMessage.textContent,/すでに参加証/);
 assert.deepEqual(p.calls.map(x=>x.input.action),['check']);
});
test('email sender failure never marks session verified or issues ticket',async()=>{
 const p=page();
 p.responses.push({status:401,data:{ok:false,code:'VERIFIED_EMAIL_SESSION_REQUIRED'}},
  {status:503,data:{ok:false,code:'EMAIL_SENDER_NOT_CONNECTED'}});
 await drain();
 p.el.eventPassEmail.value='member@gmail.com';
 await p.click('eventPassSendCode');
 assert.match(p.el.eventPassMessage.textContent,/メール送信の準備/);
 assert.deepEqual(p.calls.map(x=>x.input.action),['check','start']);
 assert.equal(p.el.eventPassTicket.hidden,true);
});
test('bad event ID is inert and does not send OTP or create ticket',async()=>{
 const p=page('?event=../../gacha');
 await drain();p.el.eventPassEmail.value='member@gmail.com';
 await p.click('eventPassSendCode');
 assert.equal(p.calls.length,0);
 assert.equal(p.el.eventPassVerify.disabled,true);
 assert.match(p.el.eventPassEventLabel.textContent,/指定がありません/);
});
test('form is mobile friendly and no pass URL is a bearer token',()=>{
 assert.match(html,/inputmode="numeric"/);
 assert.match(html,/autocomplete="one-time-code"/);
 assert.match(html,/viewport-fit=cover/);
 assert.match(html,/src="\/mio-event-pass-ui.js"/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|\/api\/gacha|\/api\/register/);
 assert.match(js,/credentials:'same-origin'/);
});
