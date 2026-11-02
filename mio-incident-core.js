// Incident inbox core. Only event metadata; never store cookies, tokens or upstream error strings.
import {createHmac,createHash,randomUUID} from 'node:crypto';
export const RELEASE='verified-incident-center-20261031';
export const RECORD_RELEASE='verified-incident-recording-20261031';
export const WRITE_RELEASE='verified-incident-triage-20261031';
const WEB=/^MIO-W-[a-f0-9]{24}$/;
const DRAW=/^[a-f0-9]{32}$/;
const OP=/^[a-f0-9]{32}$/;
const STATES=['unhandled','working','resolved'];
const CATEGORIES=['DRAW_UNKNOWN','DRAW_CLIENT_UNCONFIRMED','AUTH_COOKIE_MISSING','AUTH_LEGACY_REJECTED','GAS_TIMEOUT','UPSTREAM_FAILED','STATUS_UNAVAILABLE'];
const STAGES=['draw','catalog','history','status'];
const good=(x,list)=>typeof x==='string'&&list.includes(x);
export const enabled=(env=process.env)=>env.MIO_INCIDENT_CENTER_RELEASE===RELEASE;
export const canRecord=(env=process.env)=>enabled(env)&&env.MIO_INCIDENT_RECORD_RELEASE===RECORD_RELEASE&&
 typeof env.MIO_INCIDENT_FINGERPRINT_SECRET==='string'&&env.MIO_INCIDENT_FINGERPRINT_SECRET.length>=32;
export const canTriage=(env=process.env)=>enabled(env)&&env.MIO_INCIDENT_WRITE_RELEASE===WRITE_RELEASE;
export const sha=s=>createHash('sha256').update(s).digest('hex');

export function classifiedFailure(action,error){
 const name=String(error?.name||'');
 if(name==='TimeoutError'||name==='AbortError')return 'GAS_TIMEOUT';
 if(action==='draw')return 'DRAW_UNKNOWN';
 return action==='status'?'STATUS_UNAVAILABLE':'UPSTREAM_FAILED';
}
export function normalizeEvent(data){
 if(!data||!WEB.test(data.participantRef||'')||!good(data.source,['gacha','status'])||
    !good(data.category,CATEGORIES)||!good(data.stage,STAGES))throw Error('invalid incident metadata');
 const drawId=data.drawId==null?null:data.drawId;
 if(drawId!==null&&!DRAW.test(drawId))throw Error('invalid draw reference');
 if(data.stage==='draw'&&!drawId)throw Error('draw id required');
 if(data.source==='status'&&(data.stage!=='status'||drawId!==null))throw Error('invalid status event');
 return {participantRef:data.participantRef,source:data.source,category:data.category,stage:data.stage,drawId};
}
export function buildIncident(data,secret,now=Date.now()){
 const d=normalizeEvent(data);
 if(typeof secret!=='string'||secret.length<32)throw Error('missing incident fingerprint secret');
 // Events with no drawId are grouped for 15 minutes. A resolved ticket may recur as a new row.
 const timeBucket=d.drawId?'':String(Math.floor(now/900000));
 const fingerprint=createHmac('sha256',secret).update(
  [d.source,d.participantRef,d.category,d.stage,d.drawId||timeBucket].join(':')
 ).digest('hex');
 return {...d,fingerprint,incidentId:randomUUID()};
}
export async function recordIncident(query,data,secret,now=Date.now()){
 const e=buildIncident(data,secret,now);
 const result=await query(`INSERT INTO mio_admin_incidents
  (incident_id,fingerprint,participant_ref,source,category,draw_id,stage)
  SELECT $1,$2,$3,$4,$5,$6,$7
  WHERE (SELECT count(*) FROM mio_admin_incidents
         WHERE participant_ref=$3 AND occurred_at>now()-interval '1 hour')<30
     OR EXISTS (SELECT 1 FROM mio_admin_incidents
          WHERE fingerprint=$2 AND state <> 'resolved')
  ON CONFLICT (fingerprint) WHERE state <> 'resolved'
  DO UPDATE SET occurrence_count=mio_admin_incidents.occurrence_count+1,
    last_seen_at=now(),updated_at=now()
  RETURNING incident_id`,
  [e.incidentId,e.fingerprint,e.participantRef,e.source,e.category,e.drawId,e.stage]);
 // RETURNING is the authoritative row ID: ON CONFLICT may have updated an older ticket.
 // A missing or contradictory result must never be called recorded OR rate-limited.
 if(!result||!Number.isSafeInteger(result.rowCount)||!Array.isArray(result.rows)||
    result.rowCount!==result.rows.length||result.rowCount<0||result.rowCount>1)
  throw Error('incident persistence result unavailable');
 if(result.rowCount===0)return {recorded:false,incidentId:null,category:e.category};
 const storedId=result.rows[0]?.incident_id;
 if(typeof storedId!=='string'||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storedId))
  throw Error('incident persistence result unavailable');
 return {recorded:true,incidentId:storedId,category:e.category};
}
export async function listIncidents(query){
 const r=await query(`SELECT incident_id,participant_ref,source,category,draw_id,stage,
   state,occurrence_count,occurred_at,last_seen_at,updated_at
   FROM mio_admin_incidents
   ORDER BY CASE state WHEN 'unhandled' THEN 0 WHEN 'working' THEN 1 ELSE 2 END,
            last_seen_at DESC LIMIT 100`,[]);
 // A missing or partial DB response is never an empty inbox: no verified
 // result means UNKNOWN, not "0 unresolved incidents" in an operator UI.
 if(!r||!Array.isArray(r.rows)||!Number.isSafeInteger(r.rowCount)||
    r.rowCount!==r.rows.length||r.rowCount>100)
   throw Error('incident inbox read unavailable');
 for(const x of r.rows){
  if(!x||typeof x.incident_id!=='string'||
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x.incident_id)||
     !good(x.state,STATES)||!Number.isSafeInteger(x.occurrence_count)||
     x.occurrence_count<1)
   throw Error('incident inbox row invalid');
  // Match the same source/stage/draw rules used for recording. A DRAW row
  // without its draw ID or a STATUS row carrying a draw ID is not trustworthy.
  try{
   normalizeEvent({participantRef:x.participant_ref,source:x.source,
    category:x.category,stage:x.stage,drawId:x.draw_id});
  }catch{
   throw Error('incident inbox row invalid');
  }
 }
 return r.rows.map(x=>({
  incidentId:x.incident_id,participantRef:x.participant_ref,source:x.source,
  category:x.category,drawId:x.draw_id||null,stage:x.stage,state:x.state,
  count:x.occurrence_count,occurredAt:x.occurred_at,lastSeenAt:x.last_seen_at
 }));
}
export function normalizeTriage(d){
 if(!d||!good(d.action,['start','resolve'])||
  typeof d.incidentId!=='string'||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.incidentId)||
  !OP.test(d.operationId||'')||!good(d.expectedState,STATES)||
  (d.action==='start'&&d.expectedState!=='unhandled')||
  (d.action==='resolve'&&d.expectedState!=='working'))
   throw Error('invalid triage request');
 return {action:d.action,incidentId:d.incidentId,expectedState:d.expectedState,operationId:d.operationId};
}
export async function transitionIncident(client,values,actor){
 const d=normalizeTriage(values);
 if(!['admin-code','admin-passkey'].includes(actor))throw Error('invalid operator');
 const after=d.action==='start'?'working':'resolved';
 const payloadHash=sha([d.incidentId,d.action,d.expectedState].join(':'));
 try{
  // All queries in this operation must use one dedicated PostgreSQL session.
  // BEGIN/COMMIT acknowledgements are not proof of app-level recovery, but
  // an absent command acknowledgement must never be returned as success.
  const begun=await client.query('BEGIN');
  if(begun?.command!=='BEGIN')throw Error('incident transaction start unverified');
  const locked=await client.query(
   'SELECT state FROM mio_admin_incidents WHERE incident_id=$1 FOR UPDATE',[d.incidentId]);
  if(!locked||locked.rowCount!==1||!Array.isArray(locked.rows)||
     locked.rows.length!==1||!good(locked.rows[0]?.state,STATES))
   throw Error('incident current state unavailable');
  if(d.action==='resolve'){
   // A raw 'working' state is not proof that a verified operator started the
   // incident. Both a new resolution and its replay need a single START audit.
   const started=await client.query(
    `SELECT operation_id,payload_hash FROM mio_admin_incident_audit
      WHERE incident_id=$1 AND action='start'
        AND before_state='unhandled' AND after_state='working'
      LIMIT 2`,[d.incidentId]);
   if(started?.rowCount!==1||started.rows?.length!==1||
      !OP.test(started.rows[0]?.operation_id||'')||
      started.rows[0].payload_hash!==sha([d.incidentId,'start','unhandled'].join(':')))
    throw Error('incident working state lacks valid start audit');
  }
  const audit=await client.query(
   'SELECT incident_id,action,before_state,after_state,payload_hash FROM mio_admin_incident_audit WHERE operation_id=$1',[d.operationId]);
  // The operation log is authoritative. If transport returned an incomplete
  // row set, never mistake it for "no prior operation" and execute again.
  if(!audit||!Number.isSafeInteger(audit.rowCount)||audit.rowCount<0||
     !Array.isArray(audit.rows)||audit.rowCount!==audit.rows.length)
   throw Error('incident audit read unavailable');
  if(audit.rowCount){
   if(audit.rowCount!==1||!audit.rows?.[0])throw Error('ambiguous incident audit');
   const a=audit.rows[0];
   if(a.incident_id!==d.incidentId||a.action!==d.action||a.before_state!==d.expectedState||
      a.after_state!==after||a.payload_hash!==payloadHash)throw Error('operation id reuse conflict');
   // A retried START may arrive after RESOLVE. Never return an outdated 'working'
   // status to the operator or overwrite the incident's advanced state.
   const current=locked.rows[0].state;
   if(current!==after&&!(after==='working'&&current==='resolved'))
    throw Error('incident replay state inconsistent');
   if(after==='working'&&current==='resolved'){
    // A delayed START retry must not mistake an unaudited/corrupt direct
    // state change for a legitimate resolution. This is read-only.
    const resolvedAudit=await client.query(
     `SELECT operation_id,payload_hash FROM mio_admin_incident_audit
       WHERE incident_id=$1 AND action='resolve'
         AND before_state='working' AND after_state='resolved'
       LIMIT 2`,[d.incidentId]);
    if(resolvedAudit?.rowCount!==1||resolvedAudit.rows?.length!==1||
       !OP.test(resolvedAudit.rows[0]?.operation_id||'')||
       resolvedAudit.rows[0].payload_hash!==sha([d.incidentId,'resolve','working'].join(':')))
     throw Error('incident resolved state lacks valid audit');
   }
   const committed=await client.query('COMMIT');
   if(committed?.command!=='COMMIT')throw Error('incident transaction outcome unknown');
   return {replayed:true,incidentId:d.incidentId,state:current};
  }
  if(locked.rows[0].state!==d.expectedState)throw Error('incident state changed');
  const update=await client.query(
   `UPDATE mio_admin_incidents
      SET state=$2,updated_at=now(),last_actor=$3,
          resolved_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END
      WHERE incident_id=$1 AND state=$4 RETURNING incident_id`,
      [d.incidentId,after,actor,d.expectedState]);
  if(!update||update.rowCount!==1||!Array.isArray(update.rows)||
     update.rows.length!==1||update.rows[0]?.incident_id!==d.incidentId)
   throw Error('incident update conflict');
  const inserted=await client.query(`INSERT INTO mio_admin_incident_audit
   (operation_id,incident_id,actor,action,before_state,after_state,payload_hash)
   VALUES ($1,$2,$3,$4,$5,$6,$7)`,
   [d.operationId,d.incidentId,actor,d.action,d.expectedState,after,payloadHash]);
  // PostgreSQL INSERT without RETURNING reports rowCount 1 and rows [].
  // A missing/ambiguous reply must never be treated as a committed audit.
  if(!inserted||inserted.rowCount!==1||!Array.isArray(inserted.rows)||
     inserted.rows.length!==0)throw Error('incident audit insert unavailable');
  const committed=await client.query('COMMIT');
  if(committed?.command!=='COMMIT')throw Error('incident transaction outcome unknown');
  return {replayed:false,incidentId:d.incidentId,state:after};
 }catch(e){
  try{await client.query('ROLLBACK')}catch{}
  throw e;
 }
}
