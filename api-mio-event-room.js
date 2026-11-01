// Event content only, never a public file or a raw passId link.
import pg from 'pg';
import {prepare} from './bridge.js';
import {enabled,readVerifiedEmailCookie,eventIdOK} from './mio-event-pass-core.js';
import {readEventRoom} from './mio-event-room-core.js';
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const reply=(res,status,obj)=>res.status(status).json(obj);
let pool;
function db(){
 if(!pool)pool=new pg.Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,
  ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:1500,
  statement_timeout:3000,query_timeout:3000,idleTimeoutMillis:1000});
 return pool;
}
export default async function handler(req,res){
 if(!prepare(req,res))return;
 res.setHeader('Vary','Origin');
 res.setHeader('Cache-Control','private, no-store');
 if(req.headers.host!==HOST||req.headers.origin!=='https://'+HOST)
  return reply(res,403,{ok:false,code:'INVALID_ORIGIN'});
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))
  return reply(res,415,{ok:false,code:'JSON_REQUIRED'});
 if(Number(req.headers['content-length']||0)>256)
  return reply(res,413,{ok:false,code:'REQUEST_TOO_LARGE'});
 let body;
 try{body=typeof req.body==='string'?JSON.parse(req.body):req.body}
 catch{return reply(res,400,{ok:false,code:'INVALID_JSON'})}
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).length!==1||!eventIdOK(body.eventId))
  return reply(res,400,{ok:false,code:'INVALID_EVENT'});
 // Separate release control prevents room access during partial rollout.
 if(!enabled()||
   process.env.MIO_EVENT_ROOM_RELEASE!=='verified-event-room-phase2f-20261101'||
   !process.env.MIO_REGISTRATION_DATABASE_URL)
  return reply(res,503,{ok:false,code:'EVENT_ROOM_DISABLED'});
 const proof=readVerifiedEmailCookie(req.headers.cookie,process.env.MIO_EVENT_EMAIL_SESSION_SECRET);
 if(!proof)return reply(res,401,{ok:false,code:'VERIFIED_EMAIL_REQUIRED'});
 try{
  const room=await readEventRoom(db(),{eventId:body.eventId,subjectId:proof.subjectId});
  if(!room.allowed)return reply(res,403,{ok:false,code:'EVENT_ENTRY_DENIED'});
  return reply(res,200,{ok:true,eventId:body.eventId,title:room.title,bodyText:room.bodyText});
 }catch{
  return reply(res,503,{ok:false,code:'EVENT_ROOM_UNAVAILABLE'});
 }
}
