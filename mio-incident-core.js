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
 return {recorded:result?.rowCount!==0,incidentId:e.incidentId,category:e.category};
}
export async function listIncidents(query){
 const r=await query(`SELECT incident_id,participant_ref,source,category,draw_id,stage,
   state,occurrence_count,occurred_at,last_seen_at,updated_at
   FROM mio_admin_incidents
   ORDER BY CASE state WHEN 'unhandled' THEN 0 WHEN 'working' THEN 1 ELSE 2 END,
            last_seen_at DESC LIMIT 100`,[]);
 return (r.rows||[]).map(x=>({
  incidentId:x.incident_id,participantRef:x.participant_ref,source:x.source,
  category:x.category,drawId:x.draw_id||null,stage:x.stage,state:x.state,
  count:x.occurrence_count,occurredAt:x.occurred_at,lastSeenAt:x.last_seen_at
 }));
}
export function normalizeTriage(d){
 if(!d||!good(d.action,['start','resolve'])||
  typeof d.incidentId!=='string'||!/^[0-9a-f-]{36}$/i.test(d.incidentId)||
  !OP.test(d.operationId||'')||!good(d.expectedState,STATES)||
  (d.action==='start'&&d.expectedState!=='unhandled')||
  (d.action==='resolve'&&d.expectedState==='resolved'))
   throw Error('invalid triage request');
 return {action:d.action,incidentId:d.incidentId,expectedState:d.expectedState,operationId:d.operationId};
}
export async function transitionIncident(client,values,actor){
 const d=normalizeTriage(values);
 if(!['admin-code','admin-passkey'].includes(actor))throw Error('invalid operator');
 const after=d.action==='start'?'working':'resolved';
 const payloadHash=sha([d.incidentId,d.action,d.expectedState].join(':'));
 await client.query('BEGIN');
 try{
  const locked=await client.query(
   'SELECT state FROM mio_admin_incidents WHERE incident_id=$1 FOR UPDATE',[d.incidentId]);
  if(locked.rowCount!==1)throw Error('incident not found');
  const audit=await client.query(
   'SELECT incident_id,action,before_state,payload_hash FROM mio_admin_incident_audit WHERE operation_id=$1',[d.operationId]);
  if(audit.rowCount){
   const a=audit.rows[0];
   if(a.incident_id!==d.incidentId||a.action!==d.action||a.before_state!==d.expectedState||
      a.payload_hash!==payloadHash)throw Error('operation id reuse conflict');
   await client.query('COMMIT');
   return {replayed:true,incidentId:d.incidentId,state:after};
  }
  if(locked.rows[0].state!==d.expectedState)throw Error('incident state changed');
  const update=await client.query(
   `UPDATE mio_admin_incidents
      SET state=$2,updated_at=now(),last_actor=$3,
          resolved_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END
      WHERE incident_id=$1 AND state=$4 RETURNING incident_id`,
      [d.incidentId,after,actor,d.expectedState]);
  if(update.rowCount!==1)throw Error('incident update conflict');
  await client.query(`INSERT INTO mio_admin_incident_audit
   (operation_id,incident_id,actor,action,before_state,after_state,payload_hash)
   VALUES ($1,$2,$3,$4,$5,$6,$7)`,
   [d.operationId,d.incidentId,actor,d.action,d.expectedState,after,payloadHash]);
  await client.query('COMMIT');
  return {replayed:false,incidentId:d.incidentId,state:after};
 }catch(e){
  try{await client.query('ROLLBACK')}catch{}
  throw e;
 }
}
