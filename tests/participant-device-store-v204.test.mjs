import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_APPROVED_BROWSERS,LinkError,linkVerifiedBrowser,revokeVerifiedBrowser,listVerifiedBrowsers} from '../participant-device-store-v204.js';
const mioId='MIO-0039';
const browserId=n=>'MIO-W-'+n.toString(16).padStart(24,'0');
const tokenHash=n=>n.toString(16).padStart(64,'0');
const verified=async({mioId})=>({mioId,userVerified:true,challengeConsumed:true,method:'webauthn-uv',actorBrowserId:browserId(1)});
function fakeDatabase(){
  const rows=new Map(),audits=[],events=[];
  let crashOnAudit=false;
  const client={
    async query(sql,p=[]){
      events.push({sql,p});
      if(sql==='BEGIN'){this.snapshot={rows:new Map([...rows].map(([k,v])=>[k,{...v}])),audits:audits.length};return {rowCount:0,rows:[]}}
      if(sql==='COMMIT'){this.snapshot=null;return {rowCount:0,rows:[]}}
      if(sql==='ROLLBACK'){
        rows.clear();for(const [k,v] of this.snapshot?.rows||[])rows.set(k,v);
        audits.length=this.snapshot?.audits??0;
        this.snapshot=null;return {rowCount:0,rows:[]};
      }
      if(sql.includes('pg_advisory_xact_lock'))return {rowCount:1,rows:[{}]};
      if(sql.startsWith('SELECT mio_id,browser_id,token_hash,status')){
        const x=rows.get(p[0]);return {rowCount:x?1:0,rows:x?[{...x}]:[]};
      }
      if(sql.startsWith('SELECT count(*)')){
        const count=[...rows.values()].filter(r=>r.mio_id===p[0]&&r.status==='active').length;
        return {rowCount:1,rows:[{count}]};
      }
      if(sql.startsWith('SELECT status FROM')){
        const x=rows.get(p[1]);return {rowCount:x?.mio_id===p[0]?1:0,rows:x?.mio_id===p[0]?[{status:x.status}]:[]};
      }
      if(sql.startsWith('INSERT INTO mio_browser_links_v204')){
        const [mio_id,browser_id,token_hash,verified_method]=p;
        if(rows.has(browser_id))return {rowCount:0,rows:[]};
        rows.set(browser_id,{mio_id,browser_id,token_hash,status:'active',verified_method,linked_at:new Date().toISOString()});
        return {rowCount:1,rows:[{browser_id}]};
      }
      if(sql.startsWith('UPDATE mio_browser_links_v204')){
        const x=rows.get(p[1]);if(!x||x.mio_id!==p[0]||x.status!=='active')return {rowCount:0,rows:[]};
        x.status='revoked';return {rowCount:1,rows:[{browser_id:p[1]}]};
      }
      if(sql.startsWith('INSERT INTO mio_browser_link_audit_v204')){
        if(crashOnAudit)throw Error('DB audit write failed');
        audits.push(p);return {rowCount:1,rows:[]};
      }
      if(sql.startsWith('SELECT browser_id,verified_method,linked_at')){
        const result=[...rows.values()].filter(r=>r.mio_id===p[0]&&r.status==='active').map(({browser_id,verified_method,linked_at})=>({browser_id,verified_method,linked_at}));
        return {rowCount:result.length,rows:result};
      }
      throw Error('Unrecognized SQL '+sql);
    },
    release(){events.push({sql:'RELEASE'})}
  };
  const db={async connect(){return client},async query(sql,p){return client.query(sql,p)}};
  return {db,rows,audits,events,setAuditFailure(x){crashOnAudit=x}};
}
const props=n=>({mioId,browserId:browserId(n),tokenHash:tokenHash(n)});
const opts=f=>({db:f.db,verifyOwnership:verified});

test('rejects invalid MIO, browser identity and hash before DB',async()=>{
  const f=fakeDatabase();
  await assert.rejects(linkVerifiedBrowser({...props(1),mioId:'MIO-99999'},opts(f)),/INVALID_MIO_ID/);
  await assert.rejects(linkVerifiedBrowser({...props(1),browserId:'MIO-W-X'},opts(f)),/INVALID_BROWSER_ID/);
  await assert.rejects(linkVerifiedBrowser({...props(1),tokenHash:'bad'},opts(f)),/INVALID_TOKEN_HASH/);
  assert.equal(f.events.length,0);
});
test('rejects missing verifier, mismatched MIO proof and name/IP proofs',async()=>{
  const f=fakeDatabase();
  await assert.rejects(linkVerifiedBrowser(props(1),{db:f.db}),/VERIFIER_REQUIRED/);
  await assert.rejects(linkVerifiedBrowser(props(1),{db:f.db,verifyOwnership:async()=>({mioId:'MIO-0001',userVerified:true,challengeConsumed:true,method:'webauthn-uv'})}),/VERIFICATION_REQUIRED/);
  await assert.rejects(linkVerifiedBrowser(props(1),{db:f.db,verifyOwnership:async()=>({mioId,userVerified:true,challengeConsumed:true,method:'ip-and-name'})}),/VERIFICATION_REQUIRED/);
  await assert.rejects(linkVerifiedBrowser(props(1),{db:f.db,verifyOwnership:async()=>({mioId,userVerified:true,challengeConsumed:false,method:'webauthn-uv'})}),/VERIFICATION_REQUIRED/);
  assert.equal(f.events.length,0);
});
test('first verified browser creates exactly one link and audit record',async()=>{
  const f=fakeDatabase();const r=await linkVerifiedBrowser(props(1),opts(f));
  assert.equal(r.created,true);assert.equal(f.rows.size,1);assert.equal(f.audits.length,1);
  assert.equal(f.rows.get(browserId(1)).verified_method,'webauthn-uv');
  assert.ok(f.events.some(c=>c.sql.includes('pg_advisory_xact_lock')));
});
test('retry with same token is idempotent; altered token and MIO reject',async()=>{
  const f=fakeDatabase();await linkVerifiedBrowser(props(1),opts(f));
  assert.equal((await linkVerifiedBrowser(props(1),opts(f))).created,false);
  assert.equal(f.audits.length,1);
  await assert.rejects(linkVerifiedBrowser({...props(1),tokenHash:tokenHash(5)},opts(f)),/BROWSER_ALREADY_BOUND/);
  const alt={...props(1),mioId:'MIO-0040'};
  await assert.rejects(linkVerifiedBrowser(alt,{db:f.db,verifyOwnership:async()=>({...await verified({mioId:'MIO-0040'}),mioId:'MIO-0040'})}),/BROWSER_ALREADY_BOUND/);
});
test('exactly five active browsers; sixth denied without evicting oldest',async()=>{
  const f=fakeDatabase();assert.equal(MAX_APPROVED_BROWSERS,5);
  for(let n=1;n<=5;n++)await linkVerifiedBrowser(props(n),opts(f));
  await assert.rejects(linkVerifiedBrowser(props(6),opts(f)),/BROWSER_LIMIT_REACHED/);
  assert.equal(f.rows.size,5);assert.equal(f.audits.length,5);
  for(let n=1;n<=5;n++)assert.equal(f.rows.get(browserId(n)).status,'active');
});
test('strongly verified revocation opens one slot; revoked device cannot revive itself',async()=>{
  const f=fakeDatabase();for(let n=1;n<=5;n++)await linkVerifiedBrowser(props(n),opts(f));
  const r=await revokeVerifiedBrowser({mioId,targetBrowserId:browserId(2)},opts(f));
  assert.equal(r.revoked,true);assert.equal(f.rows.get(browserId(2)).status,'revoked');
  await assert.rejects(linkVerifiedBrowser(props(2),opts(f)),/BROWSER_REVOKED/);
  await linkVerifiedBrowser(props(6),opts(f));
  const d=await listVerifiedBrowsers(mioId,opts(f));
  assert.equal(d.devices.length,5);assert.equal(d.devices.some(x=>x.browserId===browserId(2)),false);
  assert.equal(d.devices.some(x=>'token_hash' in x),false);
  assert.equal(f.audits.length,7);
});
test('last active browser is protected from accidental lockout',async()=>{
  const f=fakeDatabase();await linkVerifiedBrowser(props(1),opts(f));
  await assert.rejects(revokeVerifiedBrowser({mioId,targetBrowserId:browserId(1)},opts(f)),/LAST_BROWSER_RECOVERY_REQUIRED/);
  assert.equal(f.rows.get(browserId(1)).status,'active');
});
test('unowned browser cannot be revoked; prevents cross-MIO disclosure',async()=>{
  const f=fakeDatabase();await linkVerifiedBrowser(props(1),opts(f));
  await assert.rejects(revokeVerifiedBrowser({mioId,targetBrowserId:browserId(2)},opts(f)),/BROWSER_NOT_FOUND/);
  assert.equal(f.audits.length,1);
});
test('audit insert failure rolls back new link in transaction',async()=>{
  const f=fakeDatabase();f.setAuditFailure(true);
  await assert.rejects(linkVerifiedBrowser(props(1),opts(f)),/audit write failed/);
  assert.equal(f.rows.size,0);assert.equal(f.audits.length,0);
  assert.ok(f.events.some(e=>e.sql==='ROLLBACK'));
  assert.equal(f.events.at(-1).sql,'RELEASE');
});
test('listing requires fresh verified proof and never exposes tokens',async()=>{
  const f=fakeDatabase();await linkVerifiedBrowser(props(1),opts(f));
  await assert.rejects(listVerifiedBrowsers(mioId,{db:f.db,verifyOwnership:async()=>({mioId,userVerified:false,challengeConsumed:true,method:'webauthn-uv'})}),/VERIFICATION_REQUIRED/);
  const listed=await listVerifiedBrowsers(mioId,opts(f));
  assert.equal(listed.devices.length,1);
  assert.deepEqual(Object.keys(listed.devices[0]).sort(),['browserId','linkedAt','method']);
});
