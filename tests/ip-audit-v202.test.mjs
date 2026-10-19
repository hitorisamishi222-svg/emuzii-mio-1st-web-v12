import test from 'node:test';
import assert from 'node:assert/strict';
import {requestIP,auditEnrollmentIP} from '../registration-ip-audit-v202.js';
test('IP parser accepts only valid Vercel-forwarded address',()=>{
 assert.equal(requestIP({headers:{'x-forwarded-for':'203.0.113.8'}}),'203.0.113.8');
 assert.equal(requestIP({headers:{'x-forwarded-for':'2001:db8::1'}}),'2001:db8::1');
 assert.equal(requestIP({headers:{'x-forwarded-for':'not-an-ip'}}),null);
 assert.equal(requestIP({headers:{'x-vercel-forwarded-for':'203.0.113.8'}}),null);
});
test('invalid identity does not write IP audit',async()=>{
 assert.equal(await auditEnrollmentIP({headers:{'x-forwarded-for':'203.0.113.8'}},'invalid','status'),false);
});
