import assert from 'node:assert/strict';
import test from 'node:test';
import {prepare} from '../bridge.js';

function response(){
  return {
    statusCode:0,headers:{},body:null,
    setHeader(name,value){this.headers[name]=value},
    status(code){this.statusCode=code;return this},
    json(value){this.body=value;return this}
  };
}
function withEnv(values,fn){
  const names=['VERCEL_ENV','APPS_SCRIPT_SECRET','APPS_SCRIPT_URL'];
  const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  for(const name of names)delete process.env[name];
  Object.assign(process.env,values);
  try{return fn()}finally{
    for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name]}
  }
}
test('non-production APIs fail closed before reading the GAS secret',()=>{
  withEnv({VERCEL_ENV:'preview'},()=>{
    const res=response();
    const cfg=prepare({method:'POST',headers:{host:'candidate.vercel.app',origin:'https://candidate.vercel.app'}},res);
    assert.equal(cfg,null);
    assert.equal(res.statusCode,503);
    assert.match(res.body.error,/本番APIを利用できません/);
    assert.equal(res.headers['Cache-Control'],'private, no-store');
  });
});
test('production APIs still pass through to the existing GAS configuration',()=>{
  withEnv({VERCEL_ENV:'production',APPS_SCRIPT_SECRET:'s'.repeat(40)},()=>{
    const res=response();
    const cfg=prepare({method:'POST',headers:{host:'site.vercel.app',origin:'https://site.vercel.app'}},res);
    assert.equal(cfg.url,'https://script.google.com/macros/s/AKfycbyR2ujPRmZFBzdx8NGjIH4HmwHQYlpAgsLgZE5qJS-XkHuz6yZn1rfj2L27g6oKTyMIYA/exec');
    assert.equal(cfg.secret,'s'.repeat(40));
  });
});
