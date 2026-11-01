// Protected event-room read. The one SQL query checks room, event, pass,
// email subject and event member policy at the same database snapshot.
// Never serve private room text from a static URL or an arbitrary asset link.
import {eventIdOK} from './mio-event-pass-core.js';
const SUBJECT=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function readEventRoom(db,{eventId,subjectId}){
 if(!eventIdOK(eventId)||!SUBJECT.test(subjectId||''))return {allowed:false,reason:'INVALID_REQUEST'};
 const r=await db.query(`SELECT room.title,room.body_text
  FROM mio_event_rooms room
  JOIN mio_events e ON e.event_id=room.event_id
  JOIN mio_event_passes p ON p.event_id=e.event_id
  WHERE e.event_id=$1 AND p.subject_id=$2 AND p.state='active'
    AND e.state='published'
    AND e.opens_at<=now() AND e.closes_at>now()
    AND room.state='published'
    AND (
      e.policy<>'member' OR EXISTS(
        SELECT 1 FROM mio_event_verified_members m
        WHERE m.event_id=e.event_id AND m.subject_id=p.subject_id AND m.verified=true
      )
    )
  LIMIT 1`,[eventId,subjectId]);
 if(r.rowCount!==1)return {allowed:false,reason:'ACCESS_NOT_CONFIRMED'};
 const room=r.rows[0];
 if(typeof room?.title!=='string'||!room.title.trim()||
    room.title.length>120||typeof room?.body_text!=='string'||room.body_text.length>4000)
  return {allowed:false,reason:'ROOM_CONTENT_INVALID'};
 return {allowed:true,title:room.title,bodyText:room.body_text};
}
