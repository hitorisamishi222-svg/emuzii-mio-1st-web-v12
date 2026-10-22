import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerPasskeyRegistration} from '../participant-passkey-registration-server-v211.js';
const mioId='MIO-0042',browserId='MIO-W-'+'a'.repeat(24),tokenHash='b'.repeat(64);
function make(overrides={}){
 const session={mioId,browserId,tokenHash,active:true,...overrides.session};
 const state={query:0,bootstrap:0,generated:0};
 const db={async connect(){return {
   async query(sql){
     state.query++;
     if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[],rowCount:0};
     if(sql.includes('FROM mio_browser_links_v204'))
       return {rowCount:1,rows:[{mio_id:mioId,browser_id:browserId,token_hash:tokenHash,status:'active'}]};
     if(sql.includes('FROM mio_passkey_accounts_v204'))
       return {rows:[{user_handle:Buffer.alloc(32)}],rowCount:1};
     return {rows:[],rowCount:1};
   },release(){}
 }}};
 const webauthn={async generateRegistrationOptions(){state.generated++;return {challenge:'test-challenge-'+ 'x'.repeat(32)}}};
 const verifyStepUp=async({mioId,browserId,tokenHash})=>{
   state.bootstrap++;
   return {mioId,browserId,tokenHash,userVerified:true,consumed:true,method:'approved-device-pairing',...overrides.proof};
 };
 const server=createServerPasskeyRegistration({
   db,webauthn,rpID:'mio-staging.test',origin:'https://mio-staging.test',
   resolveSession:async()=>session,verifyStepUp
 });
 return {server,state};
}
test('start uses trusted session and approved browser rather than client MIO-ID',async()=>{
 const {server,state}=make();
 const r=await server.begin();
 assert.ok(r.options.challenge);
 assert.equal(state.generated,1);assert.equal(state.bootstrap,1);
});
test('invalid session fails before any SQL',async()=>{
 const {server,state}=make({session:{mioId:'bad'}});
 await assert.rejects(server.begin(),/SESSION_NOT_VERIFIED/);
 assert.equal(state.query,0);
});
test('revoked session fails before any SQL',async()=>{
 const {server,state}=make({session:{active:false}});
 await assert.rejects(server.begin(),/SESSION_NOT_VERIFIED/);
 assert.equal(state.query,0);
});
test('fresh verification is mandatory',async()=>{
 const {server,state}=make({proof:{consumed:false}});
 await assert.rejects(server.begin(),/STEP_UP_REQUIRED/);
 assert.equal(state.generated,0);
});
test('client-provided MIO-ID is not accepted by the facade',async()=>{
 const {server}=make();
 assert.equal(server.begin.length,0);
 const r=await server.begin({mioId:'MIO-0001'});
 assert.ok(r.options.challenge);
});
test('cannot create facade with missing trusted dependencies',()=>{
 assert.throws(()=>createServerPasskeyRegistration({}),/TRUSTED_DEPENDENCIES_REQUIRED/);
});
