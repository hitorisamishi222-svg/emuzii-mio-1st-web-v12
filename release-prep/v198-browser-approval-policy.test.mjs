import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * v1.9.8 acceptance tests for a pure, isolated approval decision.
 * No Apps Script, spreadsheet, or production services are invoked.
 * The implementation is intentionally absent: these tests specify the
 * required behavior and MUST fail until an implementation is added.
 */
import { decideBrowserAddition } from './v198-browser-approval-policy.mjs';

const base = {
  targetWebId: 'MIO-W-target',
  mioId: 'MIO-0003',
  verifiedMioId: 'MIO-0003',
  verifiedWebId: 'MIO-W-target',
  adminAuthorized: true,
  verificationRecorded: true,
  identityIntegrityOk: true,
  matchingPersonCount: 1,
  activeWebIds: ['MIO-W-old'],
};

test('allows additional browser without retiring existing browser', () => {
  const x = decideBrowserAddition(base);
  assert.equal(x.allowed, true);
  assert.deepEqual(x.keepActiveWebIds, ['MIO-W-old']);
});

test('allows fifth active browser but blocks sixth', () => {
  const four = ['a', 'b', 'c', 'd'];
  assert.equal(decideBrowserAddition({ ...base, activeWebIds: four }).allowed, true);
  const five = [...four, 'e'];
  const x = decideBrowserAddition({ ...base, activeWebIds: five });
  assert.equal(x.allowed, false);
  assert.equal(x.reason, 'browser_limit');
});

test('already active target does not consume another slot', () => {
  const five = ['MIO-W-target', 'b', 'c', 'd', 'e'];
  assert.equal(decideBrowserAddition({ ...base, activeWebIds: five }).allowed, true);
});

test('requires authenticated admin, not merely checked review cell', () => {
  assert.equal(decideBrowserAddition({ ...base, adminAuthorized: false }).allowed, false);
});

test('rejects changed Web ID or MIO ID after verification', () => {
  assert.equal(decideBrowserAddition({ ...base, verifiedWebId: 'MIO-W-other' }).allowed, false);
  assert.equal(decideBrowserAddition({ ...base, verifiedMioId: 'MIO-0099' }).allowed, false);
});

test('rejects inconsistent identity and ambiguous participant match', () => {
  assert.equal(decideBrowserAddition({ ...base, identityIntegrityOk: false }).allowed, false);
  assert.equal(decideBrowserAddition({ ...base, matchingPersonCount: 2 }).allowed, false);
});

test('rejects missing verified record', () => {
  assert.equal(decideBrowserAddition({ ...base, verificationRecorded: false }).allowed, false);
});
