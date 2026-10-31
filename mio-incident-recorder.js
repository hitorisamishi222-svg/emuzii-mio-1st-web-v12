// Server-only best-effort error telemetry. Disabled by default.
import {canRecord,classifiedFailure,recordIncident} from './mio-incident-core.js';
let instance=null;
async function pool(){
 if(!instance){const {default:pg}=await import('pg');instance=new pg.Pool({connectionString:process.env.GALLERY_DATABASE_URL,
  max:2,connectionTimeoutMillis:750,query_timeout:900,statement_timeout:900,
  idleTimeoutMillis:1000});}
 return instance;
}
export async function recordObservedFailure({session,action,drawId,error,category}){
 if(!canRecord()||!process.env.GALLERY_DATABASE_URL||!session?.id)return false;
 const stage=['draw','catalog','history','status'].includes(action)?action:null;
 if(!stage)return false;
 try{
  const db=await pool();
  const result=await recordIncident((sql,args)=>db.query(sql,args),{
   participantRef:session.id,
   source:stage==='status'?'status':'gacha',stage,
   category:category||classifiedFailure(stage,error),
   drawId:stage==='draw'?drawId:null
  },process.env.MIO_INCIDENT_FINGERPRINT_SECRET);
  return result.recorded===true;
 }catch{
  // Recording failures must not mutate the draw nor replace its original response.
  return false;
 }
}
