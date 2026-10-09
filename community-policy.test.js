import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicMessage,mayWrite,validateExternalVideoUrl,publicMessages,publicMedia,publishedNotices} from './community-policy.js';
test('approved and active matched participant may post; all other identities denied',()=>{
 const identity={verified:true,active:true,participantId:'MIO-0001'};
 const permission={approved:true,participantId:'MIO-0001'};
 assert.equal(mayWrite({identity,permission}),true);
 assert.equal(mayWrite({identity,permission,emergencyStop:true}),false);
 assert.equal(mayWrite({identity:{...identity,active:false},permission}),false);
 assert.equal(mayWrite({identity,permission:{...permission,participantId:'MIO-0002'}}),false);
 assert.equal(mayWrite({identity:null,permission}),false);
});
test('message validation rejects HTML, URLs, control chars and excess length',()=>{
 assert.deepEqual(validatePublicMessage(' こんにちは '),{ok:true,body:'こんにちは'});
 for(const bad of ['',' '.repeat(8),'<script>alert(1)</script>','https://example.com','javascript:alert(1)','\u0000abc','a'.repeat(301)])
  assert.equal(validatePublicMessage(bad).ok,false);
});
test('video hosts must match exact allowlisted HTTPS domains',()=>{
 for(const url of ['https://youtu.be/abcdefgh','https://www.youtube.com/watch?v=abcdefgh','https://www.tiktok.com/@example/video/123456789'])
  assert.equal(validateExternalVideoUrl(url).ok,true,url);
 for(const url of ['http://youtu.be/abcdefgh','https://youtube.com.evil.test/watch?v=abc','https://evil.test/?url=youtube.com','https://user:pass@youtu.be/abcdefgh','javascript:alert(1)','https://www.youtube.com/redirect?x=1','https://youtu.be.evil.test/a','https://www.youtube.com/'])
  assert.equal(validateExternalVideoUrl(url).ok,false,url);
});
test('public read excludes pending, removed and sensitive internal fields',()=>{
 const messages=[{id:'1',moderationState:'pending',body:'hidden',participantId:'secret'},{id:'2',moderationState:'published',nickname:'A',body:'hi',createdAt:'today',participantId:'secret'},{id:'3',moderationState:'published',deleted:true,body:'removed'}];
 const out=publicMessages(messages);
 assert.equal(out.length,1);assert.equal(out[0].id,'2');assert.equal('participantId' in out[0],false);
 const media=publicMedia([{id:'1',kind:'photo',approvalState:'pending'},{id:'2',kind:'photo',approvalState:'published',privateStorageKey:'secret',url:'/photo.png'}],'photo');
 assert.equal(media.length,1);assert.equal('privateStorageKey' in media[0],false);
});
test('announcements require explicit public approval and valid time',()=>{
 const t=Date.parse('2026-10-08T12:00:00Z');
 const notices=[{id:1,approved:true,public:true,text:'ok',startsAt:'2026-10-08T11:00:00Z'},{id:2,approved:false,public:true,text:'private'},{id:3,approved:true,public:false,text:'member info'},{id:4,approved:true,public:true,text:'expired',expiresAt:'2026-10-08T11:00:00Z'}];
 assert.deepEqual(publishedNotices(notices,t).map(x=>x.id),[1]);
});
