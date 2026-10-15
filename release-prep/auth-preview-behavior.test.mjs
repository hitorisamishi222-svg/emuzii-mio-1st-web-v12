import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function loadLogin(fetchImpl){
 const html=readFileSync(new URL('../login-recovery-demo.html',import.meta.url),'utf8');
 const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
 assert.ok(code);
 const elements=new Map();
 function el(id){
  if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',classList:{add(){},remove(){},toggle(){}}});
  return elements.get(id);
 }
 const calls=[];
 const ctx={document:{getElementById:el},fetch:async(...args)=>{calls.push(args);return fetchImpl(...args)}};
 vm.createContext(ctx);vm.runInContext(code,ctx,{timeout:1000});
 return {ctx,el,calls};
}
function response(status,contentType,data){
 return {status,ok:status>=200&&status<300,headers:{get:()=>contentType},json:async()=>data};
}
test('unconnected TEST login must not submit credentials',async()=>{
 const page=loadLogin(async()=>response(200,'text/html','<html></html>'));
 page.el('loginId').value='Example_1234';page.el('loginPassword').value='sample-only-password';
 await page.ctx.handleTestLoginSubmit();
 assert.equal(page.calls.length,1);
 assert.equal(page.calls[0][0],'/test-auth/me');
 assert.equal(page.el('loginPassword').value,'sample-only-password');
 assert.match(page.el('result').textContent,/送信していません/);
 assert.equal(page.el('testLogin').disabled,false);
});
test('unexpected TEST API JSON must not submit credentials',async()=>{
 const page=loadLogin(async()=>response(200,'application/json',{ok:true}));
 page.el('loginId').value='Example_1234';page.el('loginPassword').value='test-password';
 await page.ctx.handleTestLoginSubmit();
 assert.equal(page.calls.length,1);
 assert.match(page.el('result').textContent,/送信していません/);
});
test('verified TEST API may receive credentials on same-origin request',async()=>{
 const page=loadLogin(async(url)=>url==='/test-auth/me'
  ?response(401,'application/json',{error:'unauthorized'})
  :response(200,'application/json',{accountId:'test-only-account'}));
 page.el('loginId').value='Example_1234';page.el('loginPassword').value='test-password';
 await page.ctx.handleTestLoginSubmit();
 assert.equal(page.calls.length,2);
 assert.equal(page.calls[1][0],'/test-auth/login');
 assert.equal(page.calls[1][1].credentials,'same-origin');
 assert.equal(JSON.parse(page.calls[1][1].body).identifier,'Example_1234');
 assert.equal(page.el('loginPassword').value,'');
 assert.match(page.el('result').textContent,/成功/);
});
test('failed TEST login retains retry ability and clears busy state',async()=>{
 const page=loadLogin(async(url)=>url==='/test-auth/me'
  ?response(401,'application/json',{error:'unauthorized'})
  :response(401,'application/json',{error:'invalid_credentials'}));
 page.el('loginId').value='Example_1234';page.el('loginPassword').value='incorrect-test-password';
 await page.ctx.handleTestLoginSubmit();
 assert.equal(page.el('testLogin').disabled,false);
 assert.match(page.el('result').textContent,/パスワード/);
});
