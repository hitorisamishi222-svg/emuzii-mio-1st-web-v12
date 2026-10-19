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

test('audit rejects unknown event types before database access',async()=>{
 assert.equal(await auditEnrollmentIP({headers:{'x-forwarded-for':'203.0.113.8'}},'MIO-W-0123456789abcdef01234567','approve'),false);
});
test('audit skips when no trusted forwarded IP is present',async()=>{
 const old=process.env.MIO_IP_AUDIT_SECRET;
 const original=console.warn;
 const warnings=[];
 try{
  process.env.MIO_IP_AUDIT_SECRET='x'.repeat(64);
  console.warn=(...args)=>warnings.push(args.join(' '));
  assert.equal(await auditEnrollmentIP({headers:{}},'MIO-W-0123456789abcdef01234567','status'),false);
  assert.deepEqual(warnings,['IP audit skipped: client_ip_unavailable']);
 }finally{
  console.warn=original;
  if(old===undefined)delete process.env.MIO_IP_AUDIT_SECRET;else process.env.MIO_IP_AUDIT_SECRET=old;
 }
});
test('audit skips when secret is missing without storing an address',async()=>{
 const old=process.env.MIO_IP_AUDIT_SECRET;
 const original=console.warn;
 const warnings=[];
 try{
  delete process.env.MIO_IP_AUDIT_SECRET;
  console.warn=(...args)=>warnings.push(args.join(' '));
  assert.equal(await auditEnrollmentIP({headers:{'x-forwarded-for':'203.0.113.8'}},'MIO-W-0123456789abcdef01234567','registration'),false);
  assert.deepEqual(warnings,['IP audit skipped: audit_secret_unavailable']);
 }finally{
  console.warn=original;
  if(old===undefined)delete process.env.MIO_IP_AUDIT_SECRET;else process.env.MIO_IP_AUDIT_SECRET=old;
 }
});
