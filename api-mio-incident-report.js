// Participant-side incident report, strictly restricted to signed existing sessions.
// A report NEVER performs a draw, approves registration or modifies gacha entitlements.
import {prepare,readSession} from './bridge.js';
import {recordObservedFailure} from './mio-incident-recorder.js';
import {canRecord} from './mio-incident-core.js';
const SITE='emuzii-mio-1st-web-v12.vercel.app';
const RELEASE='verified-incident-client-report-20261031';
export default async function handler(req,res){
 const cfg=prepare(req,res);if(!cfg)return;
 if(req.headers.host!==SITE||req.headers.origin!=='https://'+SITE)
  return res.status(403).json({ok:false,code:'ORIGIN_INVALID'});
 if(process.env.MIO_INCIDENT_CLIENT_REPORT_RELEASE!==RELEASE||!canRecord())
  return res.status(503).json({ok:false,code:'REPORT_DISABLED'});
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
  return res.status(415).json({ok:false,code:'INVALID_CONTENT_TYPE'});
 if(Number(req.headers['content-length']||0)>384)
  return res.status(413).json({ok:false,code:'REPORT_TOO_LARGE'});
 const session=readSession(req.headers.cookie,cfg.secret);
 if(!session)return res.status(401).json({ok:false,code:'SESSION_REQUIRED'});
 let body;
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return res.status(400).json({ok:false,code:'INVALID_JSON'})}
 if(!body||body.action!=='drawUnconfirmed'||!/^[a-f0-9]{32}$/.test(body.drawId||''))
  return res.status(400).json({ok:false,code:'INVALID_REPORT'});
 // Authenticated browser says it failed to show a result; not proof that a draw committed.
 const recorded=await recordObservedFailure({
  session,action:'draw',drawId:body.drawId,
  category:'DRAW_CLIENT_UNCONFIRMED',error:Error('client display not confirmed')
 });
 return res.status(recorded?200:503).json({ok:recorded,code:recorded?'RECORDED':'REPORT_NOT_RECORDED'});
}
