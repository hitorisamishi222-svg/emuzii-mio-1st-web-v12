import test from 'node:test';
import assert from 'node:assert/strict';
import {secureWorkUrl,validateGallerySubmission,reviewTransition} from '../gallery-submissions-core.js';
import submissionHandler from '../api-gallery-submissions.js';
const sample={title:'応援イラスト',creator:'翠央っ子',description:'大切な記念作品',category:'ファンアート',url:'https://example.com/art',consent:true,website:''};
test('consented HTTPS submission is accepted with only public fields',()=>{
 assert.deepEqual(validateGallerySubmission(sample),{title:'応援イラスト',creator:'翠央っ子',description:'大切な記念作品',category:'ファンアート',url:'https://example.com/art'});
});
test('consent and spam honeypot are enforced',()=>{
 assert.equal(validateGallerySubmission({...sample,consent:false}),null);
 assert.equal(validateGallerySubmission({...sample,website:'bot'}),null);
});
test('unsupported and dangerous link schemes fail',()=>{
 for(const url of ['javascript:alert(1)','http://example.com','data:text/html,test','https://user:pass@example.com/','//example.com','/local/path'])assert.equal(secureWorkUrl(url),null);
});
test('field size and category are checked',()=>{
 assert.equal(validateGallerySubmission({...sample,title:'a'.repeat(121)}),null);
 assert.equal(validateGallerySubmission({...sample,category:'unknown'}),null);
 assert.equal(validateGallerySubmission({...sample,creator:'invalid\nname'}),null);
});
test('no private payload is propagated',()=>{
 const d=validateGallerySubmission({...sample,email:'secret@example.com',deviceId:'secret'});
 assert.equal('email' in d,false);assert.equal('deviceId' in d,false);
});

test('moderation is restricted to valid state changes',()=>{
 assert.deepEqual(reviewTransition('approve'),['pending','approved']);
 assert.deepEqual(reviewTransition('hide'),['approved','hidden']);
 assert.deepEqual(reviewTransition('restore'),['hidden','approved']);
 assert.deepEqual(reviewTransition('reopen'),['rejected','pending']);
 assert.equal(reviewTransition('delete'),null);
 assert.equal(reviewTransition('__proto__'),null);
});

test('intake stays closed without explicit settings and does not touch database',async()=>{
 const old=process.env.MIO_GALLERY_SUBMISSIONS_ENABLED;
 delete process.env.MIO_GALLERY_SUBMISSIONS_ENABLED;
 const response={code:200,headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 try{
  await submissionHandler({method:'GET',headers:{host:'emuzii-mio-1st-web-v12.vercel.app'},query:{}},response);
  assert.equal(response.code,200);
  assert.deepEqual(response.data,{ok:true,open:false});
  assert.equal(response.headers['Cache-Control'],'private, no-store');
 }finally{
  if(old===undefined)delete process.env.MIO_GALLERY_SUBMISSIONS_ENABLED;
  else process.env.MIO_GALLERY_SUBMISSIONS_ENABLED=old;
 }
});
test('wrong host cannot open intake',async()=>{
 const response={code:200,setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await submissionHandler({method:'GET',headers:{host:'unknown.example'},query:{}},response);
 assert.equal(response.code,503);
 assert.equal(response.data.ok,false);
});
