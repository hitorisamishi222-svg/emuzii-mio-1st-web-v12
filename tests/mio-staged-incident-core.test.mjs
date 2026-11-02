import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildIncident,classifiedFailure,normalizeEvent,recordIncident,listIncidents,
 normalizeTriage,transitionIncident,canRecord,canTriage,enabled} from '../mio-incident-core.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const webId='MIO-W-'+'a'.repeat(24),draw='b'.repeat(32),secret='s'.repeat(48);
const data={participantRef:webId,source:'gacha',stage:'draw',category:'DRAW_UNKNOWN',drawId:draw};
const incidentId='11111111-1111-4111-8111-111111111111';
const candidate=read('mio-incident-core.js'),schema=read('db/mio-admin-incidents-20261031.sql');
const config=JSON.parse(read('vercel.json'));

test('incident feature recording and management are disabled without individually reviewed flags',()=>{
 assert.equal(enabled({}),false);assert.equal(canRecord({}),false);assert.equal(canTriage({}),false);
 assert.equal(canRecord({MIO_INCIDENT_CENTER_RELEASE:'verified-incident-center-20261031'}),false);
 assert.equal(canTriage({MIO_INCIDENT_CENTER_RELEASE:'verified-incident-center-20261031'}),false);
});
test('incident metadata is strict, never accepts cookies, tokens or a second participant identity',()=>{
 assert.deepEqual(normalizeEvent(data),data);
 for(const invalid of [
  {...data,participantRef:'other-user'}, {...data,drawId:'bad'},
  {...data,category:'credential_dump'},
  {participantRef:webId,source:'status',stage:'status',category:'STATUS_UNAVAILABLE',drawId:draw},
  {participantRef:webId,source:'gacha',stage:'draw',category:'DRAW_UNKNOWN'}
 ])assert.throws(()=>normalizeEvent(invalid));
 const normalized=normalizeEvent({...data,tokenHash:'SECRET_TEST_VALUE',password:'SECRET_TEST_VALUE'});
 assert.equal(Object.hasOwn(normalized,'tokenHash'),false);
 assert.equal(Object.hasOwn(normalized,'password'),false);
});
test('the same drawId yields one HMAC fingerprint; status-only metadata rotates every 15 minutes',()=>{
 const first=buildIncident(data,secret,0),again=buildIncident(data,secret,900000);
 assert.equal(first.fingerprint,again.fingerprint);
 assert.notEqual(first.incidentId,again.incidentId);
 assert.notEqual(first.fingerprint,createHash('sha256').update(draw).digest('hex'));
 const status={participantRef:webId,source:'status',category:'STATUS_UNAVAILABLE',stage:'status'};
 assert.equal(buildIncident(status,secret,0).fingerprint,buildIncident(status,secret,899999).fingerprint);
 assert.notEqual(buildIncident(status,secret,0).fingerprint,buildIncident(status,secret,900000).fingerprint);
 assert.throws(()=>buildIncident(data,'weak'));
});
test('uncertain draw response is never incorrectly presented as a confirmed win or available new draw',()=>{
 assert.equal(classifiedFailure('draw',new Error('connection closed')),'DRAW_UNKNOWN');
 assert.equal(classifiedFailure('draw',{name:'TimeoutError'}),'GAS_TIMEOUT');
 assert.equal(classifiedFailure('history',{name:'AbortError'}),'GAS_TIMEOUT');
 assert.equal(classifiedFailure('status',new Error('offline')),'STATUS_UNAVAILABLE');
 assert.equal(classifiedFailure('catalog',new Error('offline')),'UPSTREAM_FAILED');
 assert.doesNotMatch(candidate,/action\s*:\s*['"]draw['"]|callGAS\(['"]draw|resetGacha|grantGacha/);
});
test('candidate incident SQL is audit-only, never a participant, attendance, draw or prize migration',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS mio_admin_incidents/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS mio_admin_incident_audit/);
 assert.match(schema,/CREATE UNIQUE INDEX IF NOT EXISTS mio_incidents_open_fingerprint/);
 assert.doesNotMatch(schema,/\b(?:ALTER|UPDATE|DELETE|DROP|TRUNCATE)\s+(?:TABLE\s+)?(?:emuzii_|mio_registration|mio_draw|mio_gacha)/i);
 assert.doesNotMatch(schema,/\bINSERT INTO\s+(?:emuzii_|mio_registration|mio_draw|mio_gacha)/i);
});
test('future incident audit schema requires exactly ordered start and resolve transitions',()=>{
 assert.match(schema,/action='start' AND before_state='unhandled' AND after_state='working'/);
 assert.match(schema,/action='resolve' AND before_state='working' AND after_state='resolved'/);
 assert.doesNotMatch(schema,/action='resolve' AND before_state='unhandled'/);
});
test('disabled integration has no incident server endpoints or DB migration execution path',()=>{
 const apiRoutes=config.routes.map(x=>x.src);
 assert.equal(apiRoutes.includes('/api/mio-incidents'),false);
 assert.equal(apiRoutes.includes('/api/mio-incident-report'),false);
 assert.equal(apiRoutes.includes('/api/mio-gacha-result-lookup'),false);
 assert.doesNotMatch(read('gacha-web-gate.html'),/src="\/gacha-incident-admin\.js"/);
});
test('server candidate records only fixed-format opaque metadata and dedupes without touching drawing',async()=>{
 let queryResult;
 await recordIncident(async(sql,args)=>{queryResult={sql,args};return {rowCount:0}},data,secret);
 assert.match(queryResult.sql,/ON CONFLICT \(fingerprint\) WHERE state <> 'resolved'/);
 assert.match(queryResult.sql,/WHERE participant_ref=\$3 AND occurred_at>now\(\)-interval '1 hour'/);
 assert.equal(queryResult.args.length,7);
 assert.equal(queryResult.args.includes(secret),false);
 assert.equal(queryResult.args.includes(draw),true);
 assert.doesNotMatch(queryResult.sql,/UPDATE\s+emuzii_|INSERT INTO\s+mio_gacha|INSERT INTO\s+emuzii_/i);
});
test('duplicate incident resolves to the stored ticket UUID, not the discarded insert UUID',async()=>{
 const persisted=incidentId;
 const query=async()=>({rowCount:1,rows:[{incident_id:persisted}]});
 const first=await recordIncident(query,data,secret,1000);
 const duplicate=await recordIncident(query,data,secret,2000);
 assert.deepEqual(first,{recorded:true,incidentId:persisted,category:'DRAW_UNKNOWN'});
 assert.deepEqual(duplicate,first);
});
test('rate-limited and incomplete DB responses cannot claim a recorded incident',async()=>{
 const blocked=await recordIncident(async()=>({rowCount:0,rows:[]}),data,secret);
 assert.deepEqual(blocked,{recorded:false,incidentId:null,category:'DRAW_UNKNOWN'});
 await assert.rejects(recordIncident(async()=>({rowCount:1,rows:[]}),data,secret),
  /incident persistence result unavailable/);
 await assert.rejects(recordIncident(async()=>({rowCount:1}),data,secret),
  /incident persistence result unavailable/);
 await assert.rejects(recordIncident(async()=>({rowCount:1,rows:[{incident_id:'invalid'}]}),data,secret),
  /incident persistence result unavailable/);
});

test('inbox does not render missing, partial or inconsistent DB results as zero incidents',async()=>{
 for(const invalid of [undefined,null,{}, {rows:[]}, {rows:null,rowCount:0},
  {rows:[],rowCount:1},{rows:[{}],rowCount:1},{rows:[],rowCount:0.5}]){
  await assert.rejects(listIncidents(async()=>invalid),/incident inbox (read unavailable|row invalid)/);
 }
 assert.deepEqual(await listIncidents(async()=>({rowCount:0,rows:[]})),[]);
});
test('inbox rejects corrupted incident rows and only returns approved fields',async()=>{
 const row={incident_id:incidentId,participant_ref:webId,source:'gacha',category:'DRAW_UNKNOWN',
  stage:'draw',draw_id:draw,state:'unhandled',occurrence_count:1,
  occurred_at:'2026-11-02T00:00:00Z',last_seen_at:'2026-11-02T00:00:00Z',updated_at:'2026-11-02T00:00:00Z',
  raw_token:'PRIVATE_SECRET'};
 const valid=await listIncidents(async()=>({rowCount:1,rows:[row]}));
 assert.equal(valid.length,1);
 assert.equal(valid[0].incidentId,incidentId);
 assert.equal(valid[0].count,1);
 assert.equal(JSON.stringify(valid).includes('PRIVATE_SECRET'),false);
 for(const changed of [{state:'unexpected'},{incident_id:'bad'},{participant_ref:'personal-name'},
  {occurrence_count:0},{occurrence_count:'1'},{category:'unknown'},{draw_id:'bad'},
  {stage:'draw',draw_id:null},{source:'status',stage:'status',draw_id:draw},
  {source:'status',stage:'catalog',draw_id:null}]){
  await assert.rejects(listIncidents(async()=>({rowCount:1,rows:[{...row,...changed}]})),
   /incident inbox row invalid/);
 }
});
function mockClient(){
 const state={current:'unhandled',audits:new Map(),writes:0,rollback:0};
 return {state,async query(sql,args=[]){
  if(sql==='BEGIN'||sql==='COMMIT')return {rowCount:0,rows:[]};
  if(sql==='ROLLBACK'){state.rollback++;return {rowCount:0,rows:[]};}
  if(sql.startsWith('SELECT state FROM mio_admin_incidents'))return {rowCount:1,rows:[{state:state.current}]};
  if(sql.startsWith('SELECT incident_id,action'))return state.audits.has(args[0])?{rowCount:1,rows:[state.audits.get(args[0])]}:{rowCount:0,rows:[]};
  if(sql.startsWith('SELECT operation_id,payload_hash FROM mio_admin_incident_audit')){
   const rows=[...state.audits.entries()].filter(([_,a])=>a.incident_id===args[0]&&
    a.action==='resolve'&&a.before_state==='working'&&a.after_state==='resolved')
    .slice(0,2).map(([operation_id,a])=>({operation_id,payload_hash:a.payload_hash}));
   return {rowCount:rows.length,rows};
  }
  if(sql.includes('UPDATE mio_admin_incidents')){
   if(state.current!==args[3])return {rowCount:0,rows:[]};
   state.current=args[1];state.writes++;return {rowCount:1,rows:[{incident_id:args[0]}]};
  }
  if(sql.includes('INSERT INTO mio_admin_incident_audit')){
   state.audits.set(args[0],{incident_id:args[1],action:args[3],before_state:args[4],after_state:args[5],payload_hash:args[6]});
   return {rowCount:1,rows:[]};
  }
  throw Error('Unexpected SQL in isolated incident simulation');
 }};
}
test('offline incident triage is idempotent, cannot reuse operationId and changes no gacha state',async()=>{
 const db=mockClient(),start={incidentId,action:'start',expectedState:'unhandled',operationId:'c'.repeat(32)};
 const first=await transitionIncident(db,start,'admin-code');
 assert.equal(first.replayed,false);assert.equal(first.state,'working');
 const second=await transitionIncident(db,start,'admin-code');
 assert.equal(second.replayed,true);assert.equal(db.state.writes,1);
 // This must be a valid resolution request first; reuse of the START operationId must still be rejected.
 await assert.rejects(transitionIncident(db,{...start,action:'resolve',expectedState:'working'},'admin-code'),/operation id reuse conflict/);
 const done=await transitionIncident(db,{...start,action:'resolve',expectedState:'working',operationId:'d'.repeat(32)},'admin-passkey');
 assert.equal(done.state,'resolved');
 assert.equal(db.state.writes,2);assert.equal(db.state.audits.size,2);
});
test('delayed replay of start after resolution reports the real resolved state without an extra write',async()=>{
 const db=mockClient(),start={incidentId,action:'start',expectedState:'unhandled',operationId:'c'.repeat(32)};
 const finish={incidentId,action:'resolve',expectedState:'working',operationId:'d'.repeat(32)};
 await transitionIncident(db,start,'admin-code');
 await transitionIncident(db,finish,'admin-passkey');
 const writes=db.state.writes;
 const replay=await transitionIncident(db,start,'admin-code');
 assert.deepEqual(replay,{replayed:true,incidentId,state:'resolved'});
 assert.equal(db.state.current,'resolved');
 assert.equal(db.state.writes,writes);
 assert.equal(db.state.audits.size,2);
});
test('delayed start replay requires one valid resolution audit, not a bare resolved state',async()=>{
 for(const scenario of ['missing','corrupt-hash','duplicate']){
  const db=mockClient();
  const start={incidentId,action:'start',expectedState:'unhandled',operationId:'c'.repeat(32)};
  const finish={incidentId,action:'resolve',expectedState:'working',operationId:'d'.repeat(32)};
  await transitionIncident(db,start,'admin-code');
  await transitionIncident(db,finish,'admin-passkey');
  if(scenario==='missing')db.state.audits.delete(finish.operationId);
  if(scenario==='corrupt-hash')db.state.audits.get(finish.operationId).payload_hash='0'.repeat(64);
  if(scenario==='duplicate')db.state.audits.set('e'.repeat(32),
   {...db.state.audits.get(finish.operationId)});
  const before=db.state.writes;
  await assert.rejects(transitionIncident(db,start,'admin-code'),
   /incident resolved state lacks valid audit/,scenario);
  assert.equal(db.state.writes,before,'invalid retry must never update the incident');
  assert.equal(db.state.current,'resolved');
  assert.equal(db.state.rollback,1);
 }
});
test('inconsistent replay state fails closed and rolls back without an additional write',async()=>{
 const db=mockClient(),d={incidentId,action:'start',expectedState:'unhandled',operationId:'e'.repeat(32)};
 await transitionIncident(db,d,'admin-code');
 db.state.current='unhandled'; // Simulate an unexpected external state rollback.
 const writes=db.state.writes;
 await assert.rejects(transitionIncident(db,d,'admin-code'),/incident replay state inconsistent/);
 assert.equal(db.state.writes,writes);
 assert.equal(db.state.rollback,1);
});
test('incident inbox rejects more rows than its SQL LIMIT allows',async()=>{
 const row={incident_id:incidentId,participant_ref:webId,source:'gacha',category:'DRAW_UNKNOWN',
  stage:'draw',draw_id:draw,state:'unhandled',occurrence_count:1};
 const rows=Array.from({length:101},()=>row);
 await assert.rejects(listIncidents(async()=>({rowCount:101,rows})),/incident inbox read unavailable/);
});
test('tampered or missing stored after-state cannot be replayed as a successful triage',async()=>{
 for(const corrupted of ['resolved','unhandled',undefined]){
  const db=mockClient(),d={incidentId,action:'start',expectedState:'unhandled',operationId:'a'.repeat(32)};
  await transitionIncident(db,d,'admin-code');
  const stored=db.state.audits.get(d.operationId);
  if(corrupted===undefined)delete stored.after_state;
  else stored.after_state=corrupted;
  const writes=db.state.writes;
  await assert.rejects(transitionIncident(db,d,'admin-code'),/operation id reuse conflict/);
  assert.equal(db.state.writes,writes,'an invalid replay must never write again');
  assert.equal(db.state.rollback,1);
  assert.equal(db.state.current,'working');
 }
});
test('missing or truncated operation-audit responses never authorize a second update',async()=>{
 const invalid=[undefined,null,{}, {rowCount:0}, {rowCount:0,rows:null},
  {rowCount:1,rows:[]},{rowCount:0,rows:[{action:'start'}]},
  {rowCount:-1,rows:[]},{rowCount:'0',rows:[]}];
 for(const reply of invalid){
  const db=mockClient(),d={incidentId,action:'start',expectedState:'unhandled',operationId:'1'.repeat(32)};
  const original=db.query.bind(db);
  db.query=async(sql,args)=>sql.startsWith('SELECT incident_id,action')?reply:original(sql,args);
  await assert.rejects(transitionIncident(db,d,'admin-code'),/incident audit read unavailable/);
  assert.equal(db.state.writes,0,'unknown audit is never treated as a new operation');
  assert.equal(db.state.rollback,1);
  assert.equal(db.state.current,'unhandled');
 }
});
test('ambiguous duplicate audit rows cannot be accepted as a successful replay',async()=>{
 const db=mockClient(),d={incidentId,action:'start',expectedState:'unhandled',operationId:'f'.repeat(32)};
 await transitionIncident(db,d,'admin-code');
 const original=db.query.bind(db);
 db.query=async(sql,args)=>sql.startsWith('SELECT incident_id,action')?
   {rowCount:2,rows:[db.state.audits.get(d.operationId),db.state.audits.get(d.operationId)]}:
   original(sql,args);
 await assert.rejects(transitionIncident(db,d,'admin-code'),/ambiguous incident audit/);
 assert.equal(db.state.writes,1);
 assert.equal(db.state.rollback,1);
});
test('triage refuses direct resolution before an admin has started handling the case',async()=>{
 const db=mockClient();
 const direct={incidentId,action:'resolve',expectedState:'unhandled',operationId:'e'.repeat(32)};
 assert.throws(()=>normalizeTriage(direct),/invalid triage request/);
 await assert.rejects(transitionIncident(db,direct,'admin-code'),/invalid triage request/);
 assert.equal(db.state.current,'unhandled');
 assert.equal(db.state.writes,0);
 assert.equal(db.state.audits.size,0);
});
test('triage rejects malformed UUID shapes before any audit or database calls',async()=>{
 const db=mockClient();
 const valid={incidentId,action:'start',expectedState:'unhandled',operationId:'f'.repeat(32)};
 assert.deepEqual(normalizeTriage(valid),valid);
 for(const invalidId of ['-'.repeat(36),'a'.repeat(36),
   '11111111-1111-4111-8111-11111111111z','11111111_1111_4111_8111_111111111111']){
  assert.throws(()=>normalizeTriage({...valid,incidentId:invalidId}),/invalid triage request/);
  await assert.rejects(transitionIncident(db,{...valid,incidentId:invalidId},'admin-code'),/invalid triage request/);
 }
 assert.equal(db.state.writes,0);
 assert.equal(db.state.audits.size,0);
});
test('unapproved actor or stale state never creates an incident update',async()=>{
 const db=mockClient(),d={incidentId,action:'start',expectedState:'unhandled',operationId:'c'.repeat(32)};
 await assert.rejects(transitionIncident(db,d,'anonymous'),/invalid operator/);
 assert.equal(db.state.writes,0);
 assert.throws(()=>normalizeTriage({...d,expectedState:'working'}));
 assert.throws(()=>normalizeTriage({...d,operationId:'d'.repeat(32),action:'resolve',expectedState:'resolved'}));
 assert.equal(db.state.current,'unhandled');
});


test('the incident panel is diagnostic-only, shows no unverified counts and cannot refresh',()=>{
 const html=read('gacha-web-gate.html');
 const a=html.indexOf('<section id="incidentPreviewPanel"');
 const b=html.indexOf('</section>',a);
 assert.ok(a>=0&&b>a,'incident panel is missing');
 const panel=html.slice(a,b);
 for(const id of ['incidentPreviewState','incidentUnmatched','incidentWorking','incidentResolved','incidentPreviewList','incidentPreviewRefresh']){
  assert.equal(panel.split('id="'+id+'"').length-1,1,'missing or duplicated incident slot: '+id);
 }
 assert.equal((panel.match(/未接続/g)||[]).length>=4,true);
 assert.match(panel,/id="incidentPreviewRefresh"[^>]*disabled/);
 assert.doesNotMatch(panel,/<script|<form|onclick=|onchange=|fetch\s*\(|\/api\/mio-incidents/);
 assert.doesNotMatch(panel,/MIO-W-[a-f0-9]{24}|id="incidentPreviewRefresh"[^>]*\benabled\b/);
});
