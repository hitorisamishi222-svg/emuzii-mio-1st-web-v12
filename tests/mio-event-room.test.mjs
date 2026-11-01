import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readEventRoom} from '../mio-event-room-core.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const event='mio-open-2026',sub='11111111-1111-4111-8111-111111111111';
function db(data){
 const calls=[];
 return {calls,query:async(sql,args)=>{
  calls.push({sql,args});
  return data?{rowCount:1,rows:[data]}:{rowCount:0,rows:[]};
 }};
}
test('event room returns content only after server-side subject, pass, event, time and state checks',async()=>{
 const store=db({title:'イベント限定のお知らせ',body_text:'参加者だけに見せる内容。'});
 const r=await readEventRoom(store,{eventId:event,subjectId:sub});
 assert.deepEqual(r,{allowed:true,title:'イベント限定のお知らせ',bodyText:'参加者だけに見せる内容。'});
 assert.equal(store.calls.length,1);
 const {sql,args}=store.calls[0];
 assert.deepEqual(args,[event,sub]);
 for(const predicate of [
  "p.subject_id=$2","p.state='active'","e.state='published'",
  "e.opens_at<=now()","e.closes_at>now()","room.state='published'",
  "m.verified=true","m.subject_id=p.subject_id"
 ])assert.ok(sql.includes(predicate),predicate);
 assert.match(sql,/JOIN mio_event_passes p/);
 assert.match(sql,/EXISTS\(/);
 assert.doesNotMatch(sql,/token_hash|mio_registration_v2|gacha|attendance/);
});
test('no pass, revoked pass, closed event, unpublished room or unverified membership all fail closed',async()=>{
 const store=db(null);
 assert.deepEqual(await readEventRoom(store,{eventId:event,subjectId:sub}),
  {allowed:false,reason:'ACCESS_NOT_CONFIRMED'});
 assert.equal(store.calls.length,1);
});
test('invalid IDs never hit database and bad content fails closed',async()=>{
 const store=db({title:'A',body_text:'safe'});
 for(const eventId of ['../gacha','A','',null]){
  assert.equal((await readEventRoom(store,{eventId,subjectId:sub})).allowed,false);
 }
 assert.equal((await readEventRoom(store,{eventId:event,subjectId:'MIO-0010'})).allowed,false);
 assert.equal(store.calls.length,0);
 for(const room of [{title:'',body_text:'x'},{title:'x',body_text:null},{title:'x'.repeat(121),body_text:'y'}]){
  const result=await readEventRoom(db(room),{eventId:event,subjectId:sub});
  assert.equal(result.reason,'ROOM_CONTENT_INVALID');
 }
});
async function drain(){for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve))}
function browser(search,responses){
 const elements={};
 for(const id of ['eventRoomBack','eventRoomTitle','eventRoomStatus','eventRoomBody'])
  elements[id]={href:'',textContent:'',hidden:id==='eventRoomBody'};
 const calls=[];
 const fetch=async(path,init)=>{
  calls.push({path,body:JSON.parse(init.body),init});
  const d=responses.shift()||{status:403,data:{ok:false,code:'EVENT_ENTRY_DENIED'}};
  return {ok:d.status<400,status:d.status,json:async()=>d.data};
 };
 vm.runInNewContext(read('mio-event-room-ui.js'),{
  location:{search},URLSearchParams,document:{getElementById:id=>elements[id]},fetch
 });
 return {elements,calls};
}
test('browser room shows no protected content before successful private API response',async()=>{
 const b=browser('?event=mio-open-2026',[{status:403,data:{ok:false,code:'EVENT_ENTRY_DENIED'}}]);
 await drain();
 assert.equal(b.elements.eventRoomBody.hidden,true);
 assert.match(b.elements.eventRoomStatus.textContent,/参加証が確認できません/);
 assert.equal(b.calls.length,1);
 assert.equal(b.calls[0].path,'/api/mio-event-room');
 assert.equal(b.calls[0].init.credentials,'same-origin');
 assert.equal(b.elements.eventRoomBack.href,'/event-pass.html?event=mio-open-2026');
});
test('room renders text only after successful access, even when content contains raw HTML',async()=>{
 const b=browser('?event=mio-open-2026',[
  {status:200,data:{ok:true,title:'限定',bodyText:'<script>悪意のあるHTMLは実行しない</script>'}}
 ]);
 await drain();
 assert.equal(b.elements.eventRoomTitle.textContent,'限定');
 assert.match(b.elements.eventRoomBody.textContent,/<script>/);
 assert.equal(b.elements.eventRoomBody.hidden,false);
});
test('untrusted event path never calls room API',async()=>{
 const b=browser('?event=../gacha',[]);
 await drain();
 assert.equal(b.calls.length,0);
 assert.equal(b.elements.eventRoomBody.hidden,true);
});
test('event-room HTML is an empty shell, not public storage for protected content',()=>{
 const html=read('event-room.html'),js=read('mio-event-room-ui.js');
 assert.match(html,/id="eventRoomBody" hidden/);
 assert.match(html,/src="\/mio-event-room-ui.js"/);
 assert.doesNotMatch(html,/<script(?![^>]+src=)[^>]*>[^<]+<\/script>/);
 assert.match(js,/body.textContent=data.bodyText/);
 assert.doesNotMatch(js,/innerHTML|localStorage\.setItem|sessionStorage\.setItem/);
});
test('API requires same origin, email proof, separate room feature flag and existing Neon data',()=>{
 const api=read('api-mio-event-room.js');
 assert.match(api,/readVerifiedEmailCookie\(req.headers.cookie/);
 assert.match(api,/MIO_EVENT_ROOM_RELEASE/);
 assert.match(api,/EVENT_ROOM_DISABLED/);
 assert.match(api,/EVENT_ENTRY_DENIED/);
 assert.match(api,/INVALID_ORIGIN/);
 assert.match(api,/Cache-Control/);
 assert.doesNotMatch(api,/makeIdentity\(|sessionCookie\(|setLightSessionCookie\(|bridge\(/);
 const json=JSON.parse(read('vercel.json'));
 for(const route of ['/api/mio-event-room','/event-room.html','/mio-event-room-ui.js'])
  assert.equal(json.routes.filter(x=>x.src===route).length,1);
});
test('SQL candidate is complete, singular and includes private room in same transaction',()=>{
 const sql=read('db/mio-event-pass-20261101.sql');
 assert.equal(sql.match(/^BEGIN;/gm)?.length,1);
 assert.equal(sql.match(/^COMMIT;/gm)?.length,1);
 const tables=['mio_event_email_challenges','mio_event_email_subjects',
  'mio_events','mio_event_invites','mio_event_verified_members',
  'mio_event_passes','mio_event_rooms'];
 for(const tbl of tables){
  const re=new RegExp('CREATE TABLE IF NOT EXISTS '+tbl+' \\(');
  assert.equal(sql.match(re)?.length,1,tbl);
 }
 assert.match(sql,/CHECK \(email_lookup ~ '\^\[a-f0-9\]\{64\}\$'\)/);
 assert.match(sql,/UNIQUE \(event_id,subject_id\)/);
 assert.match(sql,/mio_event_rooms/);
 assert.doesNotMatch(sql,/ALTER TABLE mio_registration_v2|DROP TABLE|UPDATE mio_registration_v2/i);
});
