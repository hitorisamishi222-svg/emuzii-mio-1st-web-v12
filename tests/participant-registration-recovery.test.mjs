import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeIdentity,hash,sessionCookie,readSession,prepare} from '../bridge.js';

const register=fs.readFileSync(new URL('../api-register.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const gas=fs.readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs',import.meta.url),'utf8');

test('candidate remains fail-closed until explicit verified release',()=>{assert.match(register,/MIO_REGISTRATION_RELEASE/);assert.match(register,/verified-gas-identity-20261016/);assert.match(register,/bridge\('register'/)});
test('production-only bridge gate remains',()=>{const src=fs.readFileSync(new URL('../bridge.js',import.meta.url),'utf8');assert.match(src,/VERCEL_ENV!=='production'/);assert.match(src,/APPS_SCRIPT_SECRET/)});
test('session cookie integrity and distinct IDs',()=>{const secret='test-only-secret-not-used-in-production-123456789';const a=makeIdentity(),b=makeIdentity();assert.notEqual(a.id,b.id);assert.notEqual(a.token,b.token);assert.match(hash(a.token),/^[a-f0-9]{64}$/);const cookie=sessionCookie(a.id,a.token,secret).split(';')[0];assert.deepEqual(readSession(cookie,secret),a);assert.equal(readSession(cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0'),secret),null)});
test('registration candidate still checks prior sessions',()=>{assert.match(register,/readSession\(req.headers.cookie,cfg.secret\)/);assert.match(register,/d.participantId!==id\|\|d.verified!==true/)});
test('GAS reference guards existing identities',()=>{assert.match(gas,/duplicates.length \|\| peopleByName.length/);assert.match(gas,/pendingReview:true,needsIdentityProof:true,autoApproved:false/);assert.match(gas,/status:'承認待ち'/)});
test('public pause notice must be updated only at release',()=>{assert.match(main,/新規登録・別端末登録は本人確認の安全点検のため一時休止中/)});

test('duplicate registrations never disclose issued login ID without identity proof',()=>{assert.match(gas,/if\(duplicates.length \|\| peopleByName.length\)/);assert.match(gas,/loginId:'',/);assert.match(gas,/needsIdentityProof:true/)});
test('GAS reference requires authenticated bridge secret and identity hash',()=>{assert.match(gas,/getProperty\('BRIDGE_SECRET'\)/);assert.match(gas,/invalid identity/);assert.match(gas,/equal_\(found\[0\]\[1\],d.tokenHash\)/)});

test('legacy GAS browser auto-connection must not return',()=>{const old=fs.readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs',import.meta.url),'utf8');assert.match(old,/ログインID一致・同一参加者として自動接続/);assert.doesNotMatch(gas,/ログインID一致・同一参加者として自動接続/);});

test('identity repair requires approved status',()=>{assert.match(gas,/found\[0\]\[5\]==='承認済み'/);});
