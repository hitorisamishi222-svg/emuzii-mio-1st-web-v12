/**
 * Real PostgreSQL integration tests against an EPHEMERAL CI database only.
 * WebAuthn cryptographic responses are mocked; real device tests remain pending.
 * Never connect PGTEST_URL to production.
 */
import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,generateKeyPairSync,createHash,createSign} from 'node:crypto';
import {participantWebauthnV208} from '../participant-webauthn-server-v208.js';
import pg from 'pg';
import {recordRecentIP} from '../registration-ip-history-v203.js';
import {
  beginParticipantPasskeyRegistration,finishParticipantPasskeyRegistration,
  beginParticipantPasskeyAuthentication
} from '../participant-passkey-core-v204.js';
import {verifyPasskeyAndRunDeviceOperation} from '../participant-passkey-device-orchestrator-v206.js';
import {
  issueVerifiedOperationGrant,createVerifiedGrantConsumer
} from '../participant-verified-operation-v205.js';

const pgtest=process.env.PGTEST_URL;
if(!pgtest)throw Error('PGTEST_URL is required for staging-only database tests');
if(!/localhost|127\.0\.0\.1/.test(new URL(pgtest).hostname))
  throw Error('Refusing nonlocal database for destructive tests');

const pool=new pg.Pool({connectionString:pgtest,ssl:false,max:10});
const host='mio-staging.test',rpID=host,origin='https://'+host;
const mioId='MIO-0039',anotherMio='MIO-0040',actorBrowser='MIO-W-'+'a'.repeat(24);
const actorHash='b'.repeat(64);
const browser=n=>'MIO-W-'+n.toString(16).padStart(24,'0');
const token=n=>n.toString(16).padStart(64,'0');
let verifier;
let authChallenge;
let credentialId;

const makeResponse=challenge=>({
  id:credentialId,
  response:{clientDataJSON:Buffer.from(JSON.stringify({challenge})).toString('base64url')}
});
const bootstrap=async({mioId})=>({
  mioId,userVerified:true,deviceApproved:true,method:'approved-device-pairing'
});
function mockWebauthn(){
  let last;
  return {
    async generateRegistrationOptions(){
      last=randomBytes(32).toString('base64url');return {challenge:last};
    },
    async verifyRegistrationResponse(){
      return {verified:true,registrationInfo:{
        credential:{id:credentialId,publicKey:new Uint8Array([1,2,3,4]),counter:0,transports:['internal']}
      }};
    },
    async generateAuthenticationOptions(){
      last=randomBytes(32).toString('base64url');
      authChallenge=last;
      return {challenge:last};
    },
    async verifyAuthenticationResponse(){
      return verifier==='bad'?{verified:false}:{verified:true,authenticationInfo:{newCounter:1}};
    }
  };
}
let webauthn;
const context=()=>({db:pool,webauthn,rpID,origin,verifyBootstrap:bootstrap});
async function registerPasskey(mio=mioId){
  const {options}=await beginParticipantPasskeyRegistration(
    {mioId:mio,browserTokenHash:actorHash},context());
  return finishParticipantPasskeyRegistration(
    {mioId:mio,browserTokenHash:actorHash,response:makeResponse(options.challenge)},context());
}
async function run(operation,options={}){
  const {options:auth}=await beginParticipantPasskeyAuthentication(
    {mioId:options.mioId||mioId,browserTokenHash:actorHash},context());
  return verifyPasskeyAndRunDeviceOperation({
    mioId:options.mioId||mioId,
    actorBrowserId:actorBrowser,actorTokenHash:actorHash,
    operation,browserId:options.browserId,tokenHash:options.tokenHash,
    targetBrowserId:options.targetBrowserId,
    response:makeResponse(auth.challenge)
  },context());
}
async function link(n){return run('link-browser',{browserId:browser(n),tokenHash:token(n)});}
before(async()=>{
  for(const path of [
    'db/mio-ip-recent-v203.sql',
    'db/mio-participant-passkeys-v204.sql',
    'db/mio-browser-links-v204.sql',
    'db/mio-verified-operation-grants-v205.sql'
  ]){
    await pool.query(await readFile(new URL('../'+path,import.meta.url),'utf8'));
  }
});
beforeEach(async()=>{
  await pool.query(`TRUNCATE TABLE mio_ip_recent_v203, mio_verified_operation_grants_v205,
    mio_passkey_challenges_v204,mio_passkey_credentials_v204,
    mio_passkey_accounts_v204,mio_browser_link_audit_v204,
    mio_browser_links_v204 RESTART IDENTITY CASCADE`);
  verifier='good';
  credentialId='cred-'+randomBytes(16).toString('hex');
  webauthn=mockWebauthn();
});
after(async()=>{await pool.end()});

test('actual SQL migration rejects invalid owner and browser IDs',async()=>{
  await assert.rejects(pool.query(
    `INSERT INTO mio_browser_links_v204(mio_id,browser_id,token_hash,status,verified_method)
     VALUES('not-a-mio','MIO-W-000000000000000000000001',$1,'active','webauthn-uv')`,
    ['a'.repeat(64)]
  ),/check constraint/i);
});

test('end-to-end passkey assertion creates only its matching browser link and consumes proof',async()=>{
  await registerPasskey();
  const result=await link(1);
  assert.equal(result.created,true);
  const linkCount=await pool.query("SELECT count(*)::int AS n FROM mio_browser_links_v204 WHERE status='active'");
  assert.equal(linkCount.rows[0].n,1);
  const grantCount=await pool.query('SELECT count(*)::int AS n FROM mio_verified_operation_grants_v205 WHERE consumed_at IS NOT NULL');
  assert.equal(grantCount.rows[0].n,1);
  const audit=await pool.query('SELECT action,verification_method FROM mio_browser_link_audit_v204');
  assert.deepEqual(audit.rows,[{action:'linked',verification_method:'webauthn-uv'}]);
  const cred=await pool.query('SELECT sign_count FROM mio_passkey_credentials_v204');
  assert.equal(Number(cred.rows[0].sign_count),1);
});

test('WebAuthn challenge replay cannot issue another grant or link',async()=>{
  await registerPasskey();
  const {options:auth}=await beginParticipantPasskeyAuthentication(
    {mioId,browserTokenHash:actorHash},context());
  const payload={
    mioId,actorBrowserId:actorBrowser,actorTokenHash:actorHash,
    operation:'link-browser',browserId:browser(1),tokenHash:token(1),
    response:makeResponse(auth.challenge)
  };
  await verifyPasskeyAndRunDeviceOperation(payload,context());
  await assert.rejects(verifyPasskeyAndRunDeviceOperation(payload,context()),/CHALLENGE_EXPIRED_OR_USED/);
  const grants=await pool.query('SELECT count(*)::int AS n FROM mio_verified_operation_grants_v205');
  assert.equal(grants.rows[0].n,1);
});

test('cannot use passkey credential issued for a different MIO-ID',async()=>{
  await registerPasskey(mioId);
  await pool.query('INSERT INTO mio_passkey_accounts_v204(mio_id,user_handle) VALUES($1,$2)',
    [anotherMio,randomBytes(32)]);
  const {options:auth}=await beginParticipantPasskeyAuthentication(
    {mioId:anotherMio,browserTokenHash:actorHash},context());
  await assert.rejects(verifyPasskeyAndRunDeviceOperation({
    mioId:anotherMio,actorBrowserId:actorBrowser,actorTokenHash:actorHash,
    operation:'link-browser',browserId:browser(1),tokenHash:token(1),
    response:makeResponse(auth.challenge)
  },context()),/CREDENTIAL_NOT_FOUND/);
  const links=await pool.query('SELECT count(*)::int AS n FROM mio_browser_links_v204');
  assert.equal(links.rows[0].n,0);
});

test('failed user verification cannot issue any link or grant',async()=>{
  await registerPasskey();verifier='bad';
  await assert.rejects(link(1),/AUTHENTICATION_NOT_VERIFIED/);
  const result=await pool.query('SELECT count(*)::int AS n FROM mio_verified_operation_grants_v205');
  assert.equal(result.rows[0].n,0);
});

test('five active browser cap enforced by actual PostgreSQL transactions',async()=>{
  await registerPasskey();
  for(let n=1;n<=5;n++)assert.equal((await link(n)).created,true);
  await assert.rejects(link(6),/BROWSER_LIMIT_REACHED/);
  const result=await pool.query("SELECT browser_id FROM mio_browser_links_v204 WHERE status='active'");
  assert.equal(result.rowCount,5);
  assert.ok(result.rows.some(x=>x.browser_id===browser(1)));
});

test('after verified revoke of one of five, next browser can be linked',async()=>{
  await registerPasskey();for(let n=1;n<=5;n++)await link(n);
  const removed=await run('revoke-browser',{targetBrowserId:browser(2)});
  assert.equal(removed.revoked,true);
  assert.equal((await link(6)).created,true);
  const listing=await run('list-browsers');
  assert.equal(listing.devices.length,5);
  assert.equal(listing.devices.some(x=>x.browserId===browser(2)),false);
  assert.equal(listing.devices.some(x=>x.browserId===browser(6)),true);
});

test('last active browser cannot be removed, even after valid WebAuthn verification',async()=>{
  await registerPasskey();await link(1);
  await assert.rejects(run('revoke-browser',{targetBrowserId:browser(1)}),/LAST_BROWSER_RECOVERY_REQUIRED/);
  const r=await pool.query('SELECT status FROM mio_browser_links_v204 WHERE browser_id=$1',[browser(1)]);
  assert.equal(r.rows[0].status,'active');
});

test('replay, actor and exact-target substitution are rejected by the database',async()=>{
  await registerPasskey();
  const scope={mioId,actorBrowserId:actorBrowser,actorTokenHash:actorHash,
    operation:'link-browser',targetBrowserId:browser(1)};
  const client=await pool.connect();
  let grant;
  try{await client.query('BEGIN');grant=await issueVerifiedOperationGrant(client,scope);await client.query('COMMIT')}
  catch(e){await client.query('ROLLBACK');throw e}
  finally{client.release()}
  const good=createVerifiedGrantConsumer({db:pool,grant,
    actorBrowserId:actorBrowser,actorTokenHash:actorHash});
  await good({mioId,operation:'link-browser',targetBrowserId:browser(1)});
  const another=createVerifiedGrantConsumer({db:pool,grant,
    actorBrowserId:actorBrowser,actorTokenHash:actorHash});
  await assert.rejects(another({mioId,operation:'link-browser',targetBrowserId:browser(1)}),/GRANT_EXPIRED_USED_OR_MISMATCHED/);
  const other=createVerifiedGrantConsumer({db:pool,grant,
    actorBrowserId:actorBrowser,actorTokenHash:actorHash});
  await assert.rejects(other({mioId,operation:'link-browser',targetBrowserId:browser(2)}),/GRANT_EXPIRED_USED_OR_MISMATCHED/);
});

test('expired operation grant cannot authorize a browser change',async()=>{
  await registerPasskey();
  const c=await pool.connect();let grant;
  try{
    await c.query('BEGIN');
    grant=await issueVerifiedOperationGrant(c,{mioId,actorBrowserId:actorBrowser,
      actorTokenHash:actorHash,operation:'link-browser',targetBrowserId:browser(1)});
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  await pool.query("UPDATE mio_verified_operation_grants_v205 SET expires_at=now()-interval '1 second'");
  const consumer=createVerifiedGrantConsumer({db:pool,grant,
    actorBrowserId:actorBrowser,actorTokenHash:actorHash});
  await assert.rejects(consumer({mioId,operation:'link-browser',targetBrowserId:browser(1)}),
    /GRANT_EXPIRED_USED_OR_MISMATCHED/);
});

test('simultaneous sixth-browser attempts cannot exceed five active links',async()=>{
  await registerPasskey();
  for(let n=1;n<=4;n++)await link(n);
  const results=await Promise.allSettled([link(5),link(6),link(7)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const count=await pool.query("SELECT count(*)::int AS n FROM mio_browser_links_v204 WHERE status='active'");
  assert.equal(count.rows[0].n,5);
});

test('a failed audit write rolls back new browser link; cannot reuse the consumed grant',async()=>{
  await registerPasskey();
  await pool.query(`CREATE OR REPLACE FUNCTION mio_v207_fail_audit()
    RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'audit failure injected'; END$$`);
  await pool.query(`CREATE TRIGGER mio_v207_fail_audit_trigger
    BEFORE INSERT ON mio_browser_link_audit_v204
    FOR EACH ROW EXECUTE FUNCTION mio_v207_fail_audit()`);
  try{
    await assert.rejects(link(1),/audit failure injected/);
    const links=await pool.query('SELECT count(*)::int AS n FROM mio_browser_links_v204');
    assert.equal(links.rows[0].n,0);
    const grants=await pool.query('SELECT count(*)::int AS n FROM mio_verified_operation_grants_v205 WHERE consumed_at IS NOT NULL');
    assert.equal(grants.rows[0].n,1);
  }finally{
    await pool.query('DROP TRIGGER IF EXISTS mio_v207_fail_audit_trigger ON mio_browser_link_audit_v204');
    await pool.query('DROP FUNCTION IF EXISTS mio_v207_fail_audit()');
  }
});

test('real PostgreSQL keeps exactly five distinct hashed IPs, never plaintext',async()=>{
  const secret='mio-isolated-ip-test-secret-'.padEnd(64,'!');
  for(let n=1;n<=6;n++){
    assert.equal((await recordRecentIP({
      headers:{'x-forwarded-for':'198.51.100.'+n}
    },actorBrowser,{db:pool,secret})).recorded,true);
  }
  const rows=await pool.query('SELECT ip_hash,ip_family FROM mio_ip_recent_v203 WHERE browser_id=$1',[actorBrowser]);
  assert.equal(rows.rowCount,5);
  assert.ok(rows.rows.every(x=>/^[a-f0-9]{64}$/.test(x.ip_hash)));
  assert.ok(rows.rows.every(x=>x.ip_family===4));
  const oldest=(await import('node:crypto')).createHmac('sha256',secret)
    .update('mio-ip-v203:198.51.100.1').digest('hex');
  assert.equal(rows.rows.some(x=>x.ip_hash===oldest),false);
});

test('concurrent IP inserts are serialized and remain at the five-IP cap',async()=>{
  const secret='mio-isolated-ip-test-secret-'.padEnd(64,'!');
  await Promise.all(Array.from({length:12},(_,index)=>recordRecentIP({
    headers:{'x-forwarded-for':'203.0.113.'+(index+1)}
  },actorBrowser,{db:pool,secret})));
  const rows=await pool.query('SELECT count(*)::int AS n FROM mio_ip_recent_v203 WHERE browser_id=$1',[actorBrowser]);
  assert.equal(rows.rows[0].n,5);
});

test('stale IP observations are removed on the next valid visit',async()=>{
  const secret='mio-isolated-ip-test-secret-'.padEnd(64,'!');
  await recordRecentIP({headers:{'x-forwarded-for':'198.51.100.25'}},actorBrowser,{db:pool,secret});
  await pool.query("UPDATE mio_ip_recent_v203 SET last_seen=now()-interval '32 days'");
  await recordRecentIP({headers:{'x-forwarded-for':'198.51.100.26'}},actorBrowser,{db:pool,secret});
  const q=await pool.query('SELECT count(*)::int AS n FROM mio_ip_recent_v203 WHERE browser_id=$1',[actorBrowser]);
  assert.equal(q.rows[0].n,1);
});

/**
 * Real @simplewebauthn/server signature verification with a software
 * authenticator, using actual PostgreSQL credential rows and grants.
 * Still NOT a hardware Face ID/Android device test.
 */
async function seedRealAuthenticator(){
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwk=publicKey.export({format:'jwk'});
  const x=Buffer.from(jwk.x,'base64url'),y=Buffer.from(jwk.y,'base64url');
  const cose=Buffer.concat([
    Buffer.from([0xa5,1,2,3,0x26,0x20,1,0x21,0x58,0x20]),x,
    Buffer.from([0x22,0x58,0x20]),y
  ]);
  const id=randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO mio_passkey_accounts_v204(mio_id,user_handle) VALUES($1,$2)',
    [mioId,randomBytes(32)]);
  await pool.query(
    `INSERT INTO mio_passkey_credentials_v204(mio_id,credential_id,public_key,sign_count,transports)
     VALUES($1,$2,$3,0,$4)`,[mioId,id,cose,['internal']]
  );
  return {privateKey,id};
}
function virtualAssertion({privateKey,id},challenge,{brokenSignature=false}={}){
  const data=Buffer.from(JSON.stringify({type:'webauthn.get',origin,challenge,crossOrigin:false}));
  const auth=Buffer.alloc(37);
  createHash('sha256').update(rpID).digest().copy(auth,0);
  auth[32]=0x05;auth.writeUInt32BE(1,33);
  const signed=createSign('SHA256').update(Buffer.concat([
    auth,createHash('sha256').update(data).digest()
  ])).sign(privateKey);
  if(brokenSignature)signed[1]^=0x01;
  return {id,rawId:id,type:'public-key',
    response:{clientDataJSON:data.toString('base64url'),
      authenticatorData:auth.toString('base64url'),
      signature:signed.toString('base64url'),userHandle:null},
    clientExtensionResults:{}};
}
test('real ECDSA assertion passes library and links browser in real Postgres',async()=>{
  const authn=await seedRealAuthenticator();
  const ctx={...context(),webauthn:participantWebauthnV208};
  const start=await beginParticipantPasskeyAuthentication(
    {mioId,browserTokenHash:actorHash},ctx
  );
  const result=await verifyPasskeyAndRunDeviceOperation({
    mioId,actorBrowserId:actorBrowser,actorTokenHash:actorHash,
    operation:'link-browser',browserId:browser(1),tokenHash:token(1),
    response:virtualAssertion(authn,start.options.challenge)
  },ctx);
  assert.equal(result.created,true);
  const row=await pool.query('SELECT sign_count FROM mio_passkey_credentials_v204');
  assert.equal(Number(row.rows[0].sign_count),1);
  const proof=await pool.query(
    'SELECT consumed_at FROM mio_verified_operation_grants_v205'
  );
  assert.equal(proof.rowCount,1);
  assert.ok(proof.rows[0].consumed_at);
});
test('invalid ECDSA assertion cannot create a device or a grant',async()=>{
  const authn=await seedRealAuthenticator();
  const ctx={...context(),webauthn:participantWebauthnV208};
  const start=await beginParticipantPasskeyAuthentication(
    {mioId,browserTokenHash:actorHash},ctx
  );
  await assert.rejects(verifyPasskeyAndRunDeviceOperation({
    mioId,actorBrowserId:actorBrowser,actorTokenHash:actorHash,
    operation:'link-browser',browserId:browser(1),tokenHash:token(1),
    response:virtualAssertion(authn,start.options.challenge,{brokenSignature:true})
  },ctx),/AUTHENTICATION_NOT_VERIFIED/);
  const links=await pool.query('SELECT count(*)::int AS n FROM mio_browser_links_v204');
  assert.equal(links.rows[0].n,0);
  const grants=await pool.query('SELECT count(*)::int AS n FROM mio_verified_operation_grants_v205');
  assert.equal(grants.rows[0].n,0);
});
