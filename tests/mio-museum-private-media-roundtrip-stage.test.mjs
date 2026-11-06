import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMuseumPrivateMediaMemoryRehearsalStage as memory} from '../museum-private-media-memory-rehearsal-stage.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const OP='0123456789abcdef0123456789abcdef';
const OP2='abcdef0123456789abcdef0123456789';
const chunk=(type,data)=>{
 const h=Buffer.alloc(8);h.write(type,0,4,'ascii');h.writeUInt32LE(data.length,4);
 return Buffer.concat([h,data,...(data.length%2?[Buffer.from([0])]:[])]);
};
const makeWebp=(width=3,height=2)=>{
 const frame=Buffer.from([0,0,0,0x9d,0x01,0x2a,0,0,0,0]);
 frame.writeUInt16LE(width,6);frame.writeUInt16LE(height,8);
 const content=Buffer.concat([Buffer.from('WEBP','ascii'),chunk('VP8 ',frame)]);
 const h=Buffer.alloc(8);h.write('RIFF',0,'ascii');h.writeUInt32LE(content.length,4);
 return Buffer.concat([h,content]);
};
const payload=(width=3,height=2)=>{
 const b=makeWebp(width,height);
 return {base64:b.toString('base64'),format:'webp',bytes:b.length,width,height};
};

test('new in-memory private media must pass preflight and byte-for-byte readback',()=>{
 const stage=memory(),data=payload();
 const result=stage.saveAndVerify({operationId:OP,payload:data});
 assert.deepEqual(Object.keys(result).sort(),
  ['bytes','contentType','format','height','ok','privateOnly','replayed','sha256','width'].sort());
 assert.equal(result.ok,true);
 assert.equal(result.privateOnly,true);
 assert.equal(result.replayed,false);
 assert.equal(result.format,'webp');
 assert.equal(result.width,3);
 assert.equal(result.height,2);
 assert.equal(result.bytes,data.bytes);
 assert.equal(result.contentType,'image/webp');
 assert.equal(result.sha256,createHash('sha256').update(Buffer.from(data.base64,'base64')).digest('hex'));
 assert.equal(Object.isFrozen(result),true);
 assert.equal(stage.content,undefined);
 assert.equal(stage.records,undefined);
 assert.equal(stage.read,undefined);
 assert.equal(Object.isFrozen(stage),true);
 assert.equal('url' in result,false);
 assert.equal('publicUrl' in result,false);
 assert.equal('storageKey' in result,false);
});

test('identical submission with identical operation id returns idempotent replay (no duplicate insert)',()=>{
 const stage=memory();
 const first=stage.saveAndVerify({operationId:OP,payload:payload()});
 const second=stage.saveAndVerify({operationId:OP,payload:payload()});
 assert.equal(first.replayed,false);
 assert.equal(second.replayed,true);
 assert.equal(first.sha256,second.sha256);
 assert.deepEqual({...first,replayed:true},second);
});

test('same operation id with different image is rejected before any receipt can be replayed',()=>{
 const stage=memory(),original=payload(),other=payload(4,2);
 stage.saveAndVerify({operationId:OP,payload:original});
 assert.throws(()=>stage.saveAndVerify({operationId:OP,payload:other}),/OPERATION_CONFLICT/);
 assert.equal(stage.saveAndVerify({operationId:OP,payload:original}).replayed,true);
});

test('different operation IDs have distinct receipts but no URL or outside storage',()=>{
 const stage=memory();
 const a=stage.saveAndVerify({operationId:OP,payload:payload()});
 const b=stage.saveAndVerify({operationId:OP2,payload:payload()});
 assert.equal(a.replayed,false);
 assert.equal(b.replayed,false);
 assert.equal(stage.saveAndVerify({operationId:OP2,payload:payload()}).replayed,true);
});

test('lost write acknowledgement requires retry with the SAME operation ID',()=>{
 const faults={loseAcknowledgment:true};
 const stage=memory({faults});
 assert.throws(()=>stage.saveAndVerify({operationId:OP,payload:payload()}),
  /ACK_UNCONFIRMED_REUSE_SAME_OPERATION_ID/);
 faults.loseAcknowledgment=false;
 assert.equal(stage.saveAndVerify({operationId:OP,payload:payload()}).replayed,true);
});

test('temporary unavailable readback fails closed; same-ID verification recovers',()=>{
 const faults={readUnavailable:true};
 const stage=memory({faults});
 assert.throws(()=>stage.saveAndVerify({operationId:OP,payload:payload()}),
  /READ_UNCONFIRMED_REUSE_SAME_OPERATION_ID/);
 faults.readUnavailable=false;
 assert.equal(stage.saveAndVerify({operationId:OP,payload:payload()}).replayed,true);
});

test('write failure does not falsely report saved and can be retried safely',()=>{
 const faults={failWrite:true};
 const stage=memory({faults});
 assert.throws(()=>stage.saveAndVerify({operationId:OP,payload:payload()}),/WRITE_UNCONFIRMED/);
 faults.failWrite=false;
 assert.equal(stage.saveAndVerify({operationId:OP,payload:payload()}).replayed,false);
});

test('corrupted stored bytes remain detected on every subsequent read, never rescued by receipt alone',()=>{
 const faults={corruptStoredBytes:true};
 const stage=memory({faults});
 assert.throws(()=>stage.saveAndVerify({operationId:OP,payload:payload()}),
  /READBACK_INTEGRITY_MISMATCH/);
 faults.corruptStoredBytes=false;
 assert.throws(()=>stage.saveAndVerify({operationId:OP,payload:payload()}),
  /READBACK_INTEGRITY_MISMATCH/);
});

test('no client-selected image URL, actor, publication flag, EXIF, MIME spoof or invalid base64',()=>{
 const stage=memory(),ok=payload();
 for(const fields of [
  {...ok,publicUrl:'https://example.org/image.webp'},
  {...ok,ownerId:'fake'},
  {...ok,published:true},
  {...ok,tokenHash:'not allowed'},
  {...ok,bytes:ok.bytes+1},
  {...ok,format:'png'},
  {...ok,width:10000},
  {...ok,base64:'SGVsbG8='},
  {...ok,base64:ok.base64+'='}
 ])assert.throws(()=>stage.saveAndVerify({operationId:OP,payload:fields}),
  /MUSEUM_IMAGE_PREFLIGHT_/);
 assert.equal(stage.saveAndVerify({operationId:OP,payload:ok}).replayed,false);
});

test('malformed operation id and fault-injection configuration never create a stored entry',()=>{
 for(const op of ['',null,'1'.repeat(32),'A'.repeat(32),'0'.repeat(31),'0'.repeat(33)]){
  assert.throws(()=>memory().saveAndVerify({operationId:op,payload:payload()}),
   /OPERATION_ID_INVALID/);
 }
 for(const faults of [1,[],false,'read',true]){
  assert.throws(()=>memory({faults}),/FAULTS_INVALID/);
 }
});

test('memory data disappears with a new isolated stage instance — not a persistent save',()=>{
 const original=memory();
 assert.equal(original.saveAndVerify({operationId:OP,payload:payload()}).replayed,false);
 const another=memory();
 assert.equal(another.saveAndVerify({operationId:OP,payload:payload()}).replayed,false);
});

test('rehearsal is not deployed, does not have a network/DB interface, and does not impersonate actual authentication',()=>{
 const src=read('museum-private-media-memory-rehearsal-stage.mjs');
 const config=JSON.parse(read('vercel.json'));
 assert.equal(config.builds.some(x=>x.src==='museum-private-media-memory-rehearsal-stage.mjs'),false);
 assert.equal(config.routes.some(x=>x.src?.includes('museum-private-media-memory-rehearsal')),false);
 assert.doesNotMatch(src,/process\.env|fetch\s*\(|XMLHttpRequest|request\s*\(|https?\s*\.|storage\.put|blob\.put|pool\.query|client\.query|server\.listen|app\.post|setCookie|sessionStorage|localStorage/);
 assert.match(src,/IN-MEMORY/);
 assert.match(src,/No persistent storage/);
 assert.match(src,/prepareMuseumImageIngestPreflightStage/);
});
