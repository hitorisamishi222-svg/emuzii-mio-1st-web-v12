import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the actual Apps Script source, but replace every Apps Script service.
// The tests must NEVER access the production spreadsheet or GAS deployment.
const source = fs.readFileSync(
  new URL('../APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs', import.meta.url),
  'utf8'
);

function fixture({mode = 'normal', duplicate = false, invalidSecret = false, orphan = false} = {}) {
  let counter = 0;
  const sheets = new Map();
  function makeSheet(name) {
    const cells = new Map();
    const value = (r, c) => cells.get(r + ':' + c) ?? '';
    const set = (r, c, v) => cells.set(r + ':' + c, v);
    const sh = {
      getMaxRows: () => 1000,
      getLastColumn: () => 26,
      getLastRow() {
        let n = 1;
        for (const [key, v] of cells) {
          if (v !== '' && v != null) n = Math.max(n, Number(key.split(':')[0]));
        }
        return n;
      },
      getRange(r, c, height = 1, width = 1) {
        return {
          getValues() {
            return Array.from({length: height}, (_, i) =>
              Array.from({length: width}, (_, j) => value(r + i, c + j)));
          },
          getDisplayValues() {
            return this.getValues().map(row => row.map(String));
          },
          getValue() { return value(r, c); },
          getDisplayValue() { return String(value(r, c)); },
          setValue(v) { set(r, c, v); return this; },
          setValues(rows) {
            if (name === 'emuzii_Web登録' && r >= 2 && c === 1) {
              if (mode === 'throw') throw Error('simulated spreadsheet write failure');
              if (mode === 'silent') return this;
              if (mode === 'partial') {
                rows.forEach((row, i) => set(r + i, c, row[0]));
                return this;
              }
              if (mode === 'identityOnly') {
                rows.forEach((row, i) => row.slice(0, 2).forEach((v, j) => set(r + i, c + j, v)));
                return this;
              }
              if (mode === 'mismatch') {
                rows.forEach((row, i) => row.forEach((v, j) =>
                  set(r + i, c + j, j === 1 ? '0'.repeat(64) : v)));
                return this;
              }
            }
            rows.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v)));
            return this;
          },
          setFormula(formula) { set(r, c, formula); return this; },
          setDataValidation() { return this; }
        };
      },
      seed(row, values) { values.forEach((v, i) => set(row, i + 1, v)); },
      value
    };
    sheets.set(name, sh);
    return sh;
  }
  const web = makeSheet('emuzii_Web登録');
  const people = makeSheet('emuzii_参加者');
  if (duplicate) {
    web.seed(2, [
      'MIO-W-' + 'f'.repeat(24), '2'.repeat(64), '既存参加者', '申告なし',
      '2026-10-12', '承認済み', '確認済み', 'MIO-0004',
      '', '既存一致', 'MIO-0004', '確認済み'
    ]);
    people.seed(2, ['MIO-0004', '既存参加者']);
  }
  // A legacy orphan with an empty participant ID must never be overwritten.
  if (orphan) web.seed(duplicate ? 3 : 2, ['', '', '', '', '', '承認待ち']);
  const dv = {
    requireValueInList() { return this; },
    setAllowInvalid() { return this; },
    build() { return {}; }
  };
  const services = {
    SpreadsheetApp: {
      openById() { return {getSheetByName(name) { return sheets.get(name) ?? null; }}; },
      flush() {},
      newDataValidation() { return dv; }
    },
    PropertiesService: {
      getScriptProperties() {
        return {getProperty(key) { return key === 'BRIDGE_SECRET' ? 'isolated-test-key' : null; }};
      }
    },
    LockService: {
      getScriptLock() { return {tryLock() {return true;}, releaseLock() {}}; }
    },
    ContentService: {
      MimeType: {JSON: 'json'},
      createTextOutput(text) { return {text, setMimeType() { return this; }}; }
    },
    Utilities: {
      getUuid() {
        counter += 1;
        return String(counter).padStart(8, '0') + '-0000-4000-8000-000000000000';
      },
      sleep() {},
      formatDate() { return '2026-10-19'; }
    }
  };
  const handler = vm.runInNewContext(source + '\ndoPost', services, {
    filename: 'isolated-apps-script-v1.9.6.gs'
  });
  const payload = {
    action: 'register',
    secret: invalidSecret ? 'invalid' : 'isolated-test-key',
    participantId: 'MIO-W-' + 'a'.repeat(24),
    tokenHash: 'b'.repeat(64),
    name: duplicate ? '既存参加者' : '新規テスト参加者',
    loginId: ''
  };
  const retry = () => JSON.parse(handler({postData: {contents: JSON.stringify(payload)}}).text);
  const result = retry();
  return {result, retry, payload, web, people, registrationRow: (duplicate ? 3 : 2) + (orphan ? 1 : 0)};
}

test('new participant is persisted and verified', () => {
  const f = fixture();
  assert.equal(f.result.ok, true);
  assert.equal(f.result.verified, true);
  assert.equal(f.result.status, '承認待ち');
  assert.equal(f.web.value(f.registrationRow, 1), f.payload.participantId);
  assert.equal(f.web.value(f.registrationRow, 2), f.payload.tokenHash);
});

test('same-name browser is saved as unlinked pending review', () => {
  const f = fixture({duplicate: true});
  assert.equal(f.result.ok, true);
  assert.equal(f.result.verified, true);
  assert.equal(f.result.pendingReview, true);
  assert.equal(f.result.autoApproved, false);
  assert.equal(f.web.value(f.registrationRow, 1), f.payload.participantId);
  assert.equal(f.web.value(f.registrationRow, 6), '承認待ち');
  assert.equal(f.web.value(f.registrationRow, 8), '');
  assert.equal(f.web.value(2, 6), '承認済み');
});

for (const mode of ['silent', 'partial', 'identityOnly', 'mismatch']) {
  test('same-name browser does not acknowledge ' + mode + ' persistence', () => {
    const f = fixture({duplicate: true, mode});
    assert.equal(f.result.ok, false);
    assert.equal(f.result.error, '登録の保存を確認できませんでした');
    assert.notEqual(f.result.verified, true);
  });
}

test('new-name partial identity-only row is not a successful registration', () => {
  const f = fixture({mode:'identityOnly'});
  assert.equal(f.result.ok,false);
  assert.notEqual(f.result.verified,true);
});

test('spreadsheet write exception is not a successful registration', () => {
  const f = fixture({duplicate: true, mode: 'throw'});
  assert.equal(f.result.ok, false);
  assert.notEqual(f.result.verified, true);
});

test('invalid bridge secret is rejected before any insert', () => {
  const f = fixture({duplicate: true, invalidSecret: true});
  assert.equal(f.result.ok, false);
  assert.equal(f.result.error, 'unauthorized');
  assert.equal(f.web.value(f.registrationRow, 1), '');
});

test('nonempty orphan row without a participant ID is not overwritten', () => {
  const f = fixture({orphan: true});
  assert.equal(f.result.ok, true);
  assert.equal(f.web.value(2, 6), '承認待ち');
  assert.equal(f.web.value(2, 1), '');
  assert.equal(f.web.value(3, 1), f.payload.participantId);
});

test('same-name candidate skips orphan and remains unlinked', () => {
  const f = fixture({duplicate: true, orphan: true});
  assert.equal(f.result.ok, true);
  assert.equal(f.web.value(3, 6), '承認待ち');
  assert.equal(f.web.value(3, 1), '');
  assert.equal(f.web.value(4, 1), f.payload.participantId);
  assert.equal(f.web.value(4, 8), '');
});

test('a partially saved identity must not become verified on retry', () => {
  const f = fixture({mode:'identityOnly'});
  assert.equal(f.result.ok,false);
  assert.equal(f.retry().ok,false);
  assert.notEqual(f.retry().verified,true);
});

test('a fully saved registration can be retried without creating a second row', () => {
  const f = fixture();
  assert.equal(f.result.ok,true);
  const second=f.retry();
  assert.equal(second.ok,true);
  assert.equal(second.verified,true);
  assert.equal(second.participantId,f.payload.participantId);
  assert.equal(f.web.value(3,1),'');
});

test('recovery never edits an existing approved participant or their Web identity', () => {
  const f=fixture({duplicate:true});
  assert.equal(f.result.ok,true);
  assert.equal(f.web.value(2,1),'MIO-W-'+'f'.repeat(24));
  assert.equal(f.web.value(2,6),'承認済み');
  assert.equal(f.web.value(2,8),'MIO-0004');
  assert.equal(f.people.value(2,1),'MIO-0004');
  assert.equal(f.people.value(2,2),'既存参加者');
});
