import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildIncident,classifiedFailure,normalizeEvent,recordIncident,transitionIncident,
 canRecord,enabled,canTriage,normalizeTriage} from '../mio-incident-core.js';
const load=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const user='MIO-W-1234567890abcdef12345678',draw='a'.repeat(32),secret='s'.repeat(48);
test('disabled without explicit read, recording and triage release flags',()=>{
 assert.equal(enabled({}),false);
 assert.equal(canRecord({}),false);
 assert.equal(canTriage({}),false);
 assert.equal(canRecord({MIO_INCIDENT_CENTER_RELEASE:'verified-incident-center-20261031',
 MIO_INCIDENT_RECORD_RELEASE:'verified-incident-recording-20261031'}),false);
});
test('stable dedupe per draw but a 15-minute rolling bucket for status failures',()=>{
 const a=buildIncident({participantRef:user,source:'gacha',category:'DRAW_UNKNOWN',stage:'draw',drawId:draw},secret,0);
 const b=buildIncident({participantRef:user,source:'gacha',category:'DRAW_UNKNOWN',stage:'draw',drawId:draw},secret,900000);
 assert.equal(a.fingerprint,b.fingerprint);
 assert.notEqual(a.incidentId,b.incidentId);
 const s={participantRef:user,source:'status',category:'STATUS_UNAVAILABLE',stage:'status'};
 assert.equal(buildIncident(s,secret,0).fingerprint,buildIncident(s,secret,899999).fingerprint);
 assert.notEqual(buildIncident(s,secret,0).fingerprint,buildIncident(s,secret,900000).fingerprint);
});
test('rejects untrusted or mismatched identity and draw IDs',()=>{
 assert.throws(()=>normalizeEvent({participantRef:'nickname',source:'gacha',category:'DRAW_UNKNOWN',stage:'draw',drawId:draw}));
 assert.throws(()=>normalizeEvent({participantRef:user,source:'gacha',category:'DRAW_UNKNOWN',stage:'draw'}));
 assert.throws(()=>normalizeEvent({participantRef:user,source:'status',category:'STATUS_UNAVAILABLE',stage:'status',drawId:draw}));
 assert.throws(()=>normalizeEvent({participantRef:user,source:'gacha',category:'injected SQL',stage:'catalog'}));
});
test('error category separates upstream delay from uncertain draw result',()=>{
 assert.equal(classifiedFailure('draw',Object.assign(new Error('timeout'),{name:'TimeoutError'})),'GAS_TIMEOUT');
 assert.equal(classifiedFailure('draw',new Error('any upstream error')),'DRAW_UNKNOWN');
 assert.equal(classifiedFailure('status',new Error('offline')),'STATUS_UNAVAILABLE');
 assert.equal(classifiedFailure('catalog',new Error('offline')),'UPSTREAM_FAILED');
});
test('recording writes strictly bounded metadata and dedupe clause',async()=>{
 let captured;
 await recordIncident(async(sql,args)=>{captured={sql,args}},{
 participantRef:user,source:'gacha',stage:'draw',category:'DRAW_UNKNOWN',drawId:draw},secret);
 assert.match(captured.sql,/ON CONFLICT \(fingerprint\) WHERE state <> 'resolved'/);
 assert.equal(captured.args.length,7);
 assert.equal(captured.args.includes(user),true);
 assert.equal(captured.args.includes('password'),false);
 assert.equal(captured.sql.includes('cookies'),false);
});
function fakeClient(){
 const entry={state:'unhandled'},audit=new Map(),calls=[];
 return {entry,audit,calls,
 async query(sql,args=[]){
  calls.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT state FROM mio_admin_incidents'))return {rowCount:1,rows:[{state:entry.state}]};
  if(sql.startsWith('SELECT incident_id,action'))return audit.has(args[0])
    ?{rowCount:1,rows:[audit.get(args[0])]}:{rowCount:0,rows:[]};
  if(sql.includes('UPDATE mio_admin_incidents')){
   if(entry.state!==args[3])return {rowCount:0,rows:[]};
   entry.state=args[1];return {rowCount:1,rows:[{incident_id:args[0]}]};
  }
  if(sql.includes('INSERT INTO mio_admin_incident_audit')){
   audit.set(args[0],{incident_id:args[1],action:args[3],before_state:args[4],payload_hash:args[6]});
   return {rowCount:1,rows:[]};
  }
  throw Error('Unexpected SQL '+sql);
 }};
}
const id='11111111-1111-4111-8111-111111111111';
test('take -> resolve preserves each state and exactly two audited actions',async()=>{
 const client=fakeClient();
 const start=await transitionIncident(client,{incidentId:id,action:'start',operationId:'a'.repeat(32),expectedState:'unhandled'},'admin-code');
 assert.deepEqual(start,{replayed:false,incidentId:id,state:'working'});
 const resolve=await transitionIncident(client,{incidentId:id,action:'resolve',operationId:'b'.repeat(32),expectedState:'working'},'admin-passkey');
 assert.equal(resolve.state,'resolved');
 assert.equal(client.entry.state,'resolved');
 assert.equal(client.audit.size,2);
});
test('retry of confirmed operation ID returns replay without second UPDATE',async()=>{
 const client=fakeClient(),payload={incidentId:id,action:'start',expectedState:'unhandled',operationId:'a'.repeat(32)};
 await transitionIncident(client,payload,'admin-code');
 const first=client.calls.filter(x=>x.sql.includes('UPDATE mio_admin_incidents')).length;
 const second=await transitionIncident(client,payload,'admin-code');
 assert.equal(second.replayed,true);
 assert.equal(client.calls.filter(x=>x.sql.includes('UPDATE mio_admin_incidents')).length,first);
 assert.equal(client.entry.state,'working');
});
test('stale expectation or operation-ID reuse is rejected and rolled back',async()=>{
 const client=fakeClient(),payload={incidentId:id,action:'start',expectedState:'unhandled',operationId:'a'.repeat(32)};
 await transitionIncident(client,payload,'admin-code');
 await assert.rejects(transitionIncident(client,{...payload,action:'resolve'},'admin-code'),/operation id reuse conflict/);
 await assert.rejects(transitionIncident(client,{...payload,operationId:'b'.repeat(32)},'admin-code'),/incident state changed/);
 assert.equal(client.entry.state,'working');
 assert.ok(client.calls.some(x=>x.sql==='ROLLBACK'));
});
test('triage rejects direct reopen and unapproved operators',async()=>{
 assert.throws(()=>normalizeTriage({incidentId:id,action:'resolve',expectedState:'resolved',operationId:'a'.repeat(32)}));
 assert.throws(()=>normalizeTriage({incidentId:id,action:'start',expectedState:'working',operationId:'a'.repeat(32)}));
 await assert.rejects(transitionIncident(fakeClient(),{incidentId:id,action:'start',expectedState:'unhandled',operationId:'a'.repeat(32)},'anonymous'));
});
test('client-only report is authenticated, opt-in, and never issues a draw',()=>{
 const api=load('api-mio-incident-report.js');
 const page=load('gacha-page.js');
 const status=load('api-status.js');
 const schema=load('db/mio-admin-incidents-20261031.sql');
 assert.match(api,/readSession\(req\.headers\.cookie,cfg\.secret\)/);
 assert.match(api,/MIO_INCIDENT_CLIENT_REPORT_RELEASE/);
 assert.match(api,/canRecord\(\)/);
 assert.match(api,/recordObservedFailure/);
 assert.doesNotMatch(api,/bridge\(|action:'draw'\s*,\s*participantId/);
 assert.match(page,/action:'drawUnconfirmed'/);
 assert.match(page,/fetch\('\/api\/mio-incident-report'/);
 assert.match(status,/readLightSession/);
 assert.match(status,/AUTH_COOKIE_MISSING/);
 assert.match(schema,/DRAW_CLIENT_UNCONFIRMED/);
 assert.match(schema,/AUTH_COOKIE_MISSING/);
 const config=JSON.parse(load('vercel.json'));
 assert.equal(config.routes.find(x=>x.src==='/api/mio-incident-report')?.dest,
 '/api-mio-incident-report.js');
});
test('per participant incident recording is bounded within one hour',async()=>{
 let query;
 await recordIncident(async(sql,args)=>{query=sql;return {rowCount:0}},{
 participantRef:user,source:'gacha',stage:'draw',category:'DRAW_CLIENT_UNCONFIRMED',drawId:draw},secret);
 assert.match(query,/occurred_at>now\(\)-interval '1 hour'/);
 assert.match(query,/count\(\*\)/);
 assert.match(query,/OR EXISTS \(SELECT 1 FROM mio_admin_incidents/);
});
test('integration is guarded; present gacha, register and switch paths remain unchanged',()=>{
 const api=load('api-mio-incidents.js'),recorder=load('mio-incident-recorder.js');
 const html=load('gacha-web-gate.html'),js=load('gacha-incident-admin.js');
 const schema=load('db/mio-admin-incidents-20261031.sql');
 const gacha=load('api-gacha.js'),status=load('api-status.js');
 const config=JSON.parse(load('vercel.json'));
 assert.match(api,/authorizedCode/);assert.match(api,/sessionOK/);
 assert.match(api,/INCIDENT_CENTER_DISABLED/);assert.match(api,/INCIDENT_TRIAGE_DISABLED/);
 assert.match(recorder,/canRecord\(\)/);
 assert.match(gacha,/recordObservedFailure/);assert.match(status,/recordObservedFailure/);
 assert.match(html,/id="incidentPanel"/);assert.match(html,/gacha-incident-admin\.js/);
 assert.match(js,/mio:admin-connected/);assert.match(js,/sessionStorage/);
 assert.match(schema,/UNIQUE INDEX IF NOT EXISTS mio_incidents_open_fingerprint/);
 assert.equal(config.routes.find(x=>x.src==='/api/mio-incidents')?.dest,'/api-mio-incidents.js');
 assert.equal(config.routes.find(x=>x.src==='/api/gacha')?.dest,'/api-gacha.js');
 assert.equal(config.routes.find(x=>x.src==='/api/status')?.dest,'/api-status.js');
 assert.equal(config.routes.find(x=>x.src==='/api/gacha-web-gate')?.dest,'/api-gacha-web-gate.js');
});
