import test from 'node:test';
import assert from 'node:assert/strict';
import {secureWorkUrl,validateGallerySubmission,reviewTransition} from '../gallery-submissions-core.js';
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
