import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.4_BROWSER_PAIR.gs',import.meta.url),'utf8');
test('v1.9.4 GAS parses as valid JavaScript',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
});
test('browser pairing uses a single-use claim and an expiration',()=>{
 assert.match(source,/d\.action==='pair_create'/);
 assert.match(source,/d\.action==='pair_claim'/);
 assert.match(source,/PAIR_TTL_MS=3\*60\*1000/);
 assert.match(source,/String\(record\[7\]\)!=='未使用'/);
 assert.match(source,/new Date\(record\[6\]\)\.getTime\(\)<=Date\.now\(\)/);
 assert.match(source,/approvedBrowserSource_\(ss,web/);
});
test('history remains bound to existing canonical MIO-ID',()=>{
 assert.match(source,/browserIdentityFor_\(ss,web,d\)/);
 assert.match(source,/origin\.id/);
 assert.match(source,/integratedParticipantId:origin\.id/);
 assert.doesNotMatch(source,/if\(!submittedLoginId&&safeBase\)/);
});
const create=readFileSync(new URL('../api-browser-pair-create.js',import.meta.url),'utf8');
const claim=readFileSync(new URL('../api-browser-pair-claim.js',import.meta.url),'utf8');
test('server API uses signed sessions and random link secrets',()=>{
 assert.match(create,/randomBytes\(32\)/);
 assert.match(create,/readSession\(/);
 assert.match(create,/pair_create/);
 assert.match(claim,/makeIdentity\(/);
 assert.match(claim,/pair_claim/);
 assert.match(claim,/sessionCookie\(/);
});

import {makeServer,webId,hash} from './browser-identity-v193.test.mjs';

test('approved participant can mint pairing token without new participant record',()=>{
 const h=makeServer(source),tokenHash=hash('8');
 const r=h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:tokenHash});
 assert.equal(r.ok,true);
 assert.equal(r.expiresInSeconds,180);
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),2);
 assert.equal(h.tables['emuzii_ブラウザ接続キー'].getLastRow(),2);
});
test('link claims identity once, preserves original history, and rejects replay',()=>{
 const h=makeServer(source),tokenHash=hash('8');
 assert.equal(h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:tokenHash}).ok,true);
 const result=h.call('pair_claim',webId('b'),hash('2'),'Alice',{pairHash:tokenHash});
 assert.equal(result.ok,true);
 assert.equal(result.integratedParticipantId,'MIO-0001');
 assert.equal(h.call('status',webId('b'),hash('2')).status,'承認済み');
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),2);
 assert.equal(h.call('pair_claim',webId('c'),hash('3'),'Alice',{pairHash:tokenHash}).ok,false);
});
test('unapproved source or expired link is rejected',()=>{
 const h=makeServer(source),tokenHash=hash('8');
 assert.equal(h.call('pair_create',webId('b'),hash('2'),'Alice',{pairHash:tokenHash}).ok,false);
 assert.equal(h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:tokenHash}).ok,true);
 h.tables['emuzii_ブラウザ接続キー'].data[1][6]=new Date(Date.now()-5000);
 assert.equal(h.call('pair_claim',webId('b'),hash('2'),'Alice',{pairHash:tokenHash}).ok,false);
});
test('previously registered browser is not overwritten by pairing',()=>{
 const h=makeServer(source),tokenHash=hash('8');
 assert.equal(h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:tokenHash}).ok,true);
 assert.equal(h.call('pair_claim',webId('a'),hash('1'),'Alice',{pairHash:tokenHash}).ok,false);
});

test('an existing pending browser is upgraded after verified pairing, preserving its Web-ID',()=>{
 const h=makeServer(source),p=hash('9'),id=webId('b'),token=hash('2');
 const pending=Array(21).fill('');
 pending[0]=id;pending[1]=token;pending[2]='Alice';
 pending[5]='承認待ち';pending[6]='未確認';pending[10]=id;pending[11]='確認待ち';
 h.tables['emuzii_Web登録'].data.push(pending);
 assert.equal(h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:p}).ok,true);
 const result=h.call('pair_claim',id,token,'Alice',{pairHash:p});
 assert.equal(result.ok,true);
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),3);
 assert.equal(pending[5],'承認済み');assert.equal(pending[7],'MIO-0001');
 assert.equal(pending[10],'MIO-0001');
});
test('pending browser with different ColorSing name cannot attach to someone else',()=>{
 const h=makeServer(source),p=hash('9'),id=webId('b'),token=hash('2');
 const pending=Array(21).fill('');
 pending[0]=id;pending[1]=token;pending[2]='Different';
 pending[5]='承認待ち';
 h.tables['emuzii_Web登録'].data.push(pending);
 assert.equal(h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:p}).ok,true);
 assert.equal(h.call('pair_claim',id,token,'Different',{pairHash:p}).ok,false);
 assert.equal(pending[5],'承認待ち');
});

test('approved browser claim cannot be rebound to a different identity',()=>{
 const h=makeServer(source),p=hash('9'),id=webId('b'),token=hash('2');
 assert.equal(h.call('register',id,token).status,'承認待ち');
 const pending=h.tables['emuzii_ブラウザ接続申請'].data[1];
 pending[3]='MIO-0001';pending[4]='承認済み';
 const before=h.call('status',id,token);
 assert.equal(before.status,'承認済み');
 const count=h.tables['emuzii_Web登録'].getLastRow();
 assert.equal(h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:p}).ok,true);
 const result=h.call('pair_claim',id,token,'Alice',{pairHash:p});
 assert.equal(result.ok,false);
 assert.equal(h.tables['emuzii_Web登録'].getLastRow(),count);
 assert.equal(h.tables['emuzii_ブラウザ接続申請'].data[1][3],'MIO-0001');
});
test('a browser awaiting another MIO-ID cannot be auto-paired to Alice',()=>{
 const h=makeServer(source),p=hash('9'),id=webId('b'),token=hash('2');
 assert.equal(h.call('register',id,token).status,'承認待ち');
 h.tables['emuzii_ブラウザ接続申請'].data[1][3]='MIO-0002';
 assert.equal(h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:p}).ok,true);
 assert.equal(h.call('pair_claim',id,token,'Alice',{pairHash:p}).ok,false);
 assert.equal(h.tables['emuzii_ブラウザ接続申請'].data[1][3],'MIO-0002');
});
test('rejected source cannot mint transfer links',()=>{
 const h=makeServer(source),p=hash('9');
 h.tables['emuzii_Web登録'].data[1][5]='却下';
 assert.equal(h.call('pair_create',webId('a'),hash('1'),'Alice',{pairHash:p}).ok,false);
});
