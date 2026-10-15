import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword} from './mio-auth-crypto.mjs';
import {createPostgresLoginService} from './mio-postgres-login.mjs';
const accountId='123e4567-e89b-42d3-a456-426614174000';
const password='Strong-Example-Password-2026';
async function setup({missing=false,retired=false}={}){
 const hash=await hashPassword(password),issued=[],lookups=[];
 const pool={query:async(sql,args)=>{lookups.push(args[0]);return missing||retired?{rowCount:0,rows:[]}:{rowCount:1,rows:[{account_id:accountId,password_hash:hash}]}}};
 const sessions={create:async(id,label)=>{issued.push({id,label});return {token:'test-session-token',sessionId:'test-session-id'}}};
 return {service:createPostgresLoginService(pool,{sessions}),issued,lookups};
}
test('correct credentials issue a session for the selected device',async()=>{
 const x=await setup(),r=await x.service.login({identifier:'TestUser_2026',password,deviceLabel:'iPhone'});
 assert.equal(r.accountId,accountId);assert.equal(x.issued.length,1);assert.equal(x.issued[0].label,'iPhone');
 assert.equal(x.lookups[0],'testuser_2026');
});
test('MIO-ID can resolve same account',async()=>{
 const x=await setup(),r=await x.service.login({identifier:'MIO-TEST-0001',password,deviceLabel:'Android'});
 assert.equal(r.accountId,accountId);assert.equal(x.issued[0].label,'Android');
});
test('wrong password cannot issue a session',async()=>{
 const x=await setup();
 await assert.rejects(x.service.login({identifier:'TestUser_2026',password:'wrong'}),/invalid credentials/);
 assert.equal(x.issued.length,0);
});
test('unknown identifier cannot issue a session',async()=>{
 const x=await setup({missing:true});
 await assert.rejects(x.service.login({identifier:'unknown',password}),/invalid credentials/);
 assert.equal(x.issued.length,0);
});
test('retired login ID cannot authenticate',async()=>{
 const x=await setup({retired:true});
 await assert.rejects(x.service.login({identifier:'OldMio_2026',password}),/invalid credentials/);
 assert.equal(x.issued.length,0);
});
test('invalid payload cannot query database',async()=>{
 const x=await setup();
 await assert.rejects(x.service.login({identifier:'',password}),/invalid credentials/);
 assert.equal(x.lookups.length,0);
});
