import test from 'node:test';
import assert from 'node:assert/strict';
import {stageBrowserAdd} from './build-browseradd-v199.mjs';

const source=String.raw`/** Production-shaped source excerpt. A complete GAS export is required for actual release. */
function setupBrowserAddV189Patch() { return true; }
function approveAdditionalBrowserV189Patch_(webId, expectedMioId) {
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var web=ss.getSheetByName(WEB_TAB);
  var r=webActualRows_(web)[0];
  var mioId=String(r[7]||'');
  var people=rows_(ss,'emuzii_参加者').filter(function(p){return p[0]===mioId});
  if(people.length !== 1) throw Error('参加者のMIO-IDと名前を一意に照合できません');

  var sameApproved=webActualRows_(web).filter(function(x){return x[5]==='承認済み'});
  var hasMembership=sameApproved.some(function(x){return x[6]==='確認済み'});
  var now=new Date();
  audit.appendRow([now, mioId]);
  web.getRange(target.row, 6).setValue('承認済み');
  if(hasMembership)web.getRange(target.row,7).setValue('確認済み');
  return {ok:true};
}
function runBrowserAddV189PatchCheck() { return true; }
/* End of representative fixture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          */
`;
test('exactly one manager-verified manual approval gets an early read-only slot guard',()=>{
 const result=stageBrowserAdd(source);
 assert.equal((result.match(/assertBrowserSlotsBeforeManualAddV199_\(ss, web, r, mioId\)/g)||[]).length,1);
 assert(result.indexOf('assertBrowserSlotsBeforeManualAddV199_(ss, web, r, mioId)')<result.indexOf('audit.appendRow'));
 assert(result.indexOf('assertBrowserSlotsBeforeManualAddV199_(ss, web, r, mioId)')<result.indexOf("web.getRange(target.row, 6).setValue('承認済み')"));
 assert(result.includes('function runBrowserAddV189PatchCheck()'));
 assert(result.includes('function assertBrowserSlotsBeforeManualAddV199_('));
 assert(result.includes('function setupBrowserAddV189Patch()'));
});
test('refuses duplicate patching or wrong recovery file',()=>{
 const once=stageBrowserAdd(source);
 assert.throws(()=>stageBrowserAdd(once),/Already patched/);
 assert.throws(()=>stageBrowserAdd(source+"\nfunction switchApprovedWebRegistrationV189_() {}"),/Mixed recovery/);
});
test('rejects missing verification or unexpected approval structure',()=>{
 assert.throws(()=>stageBrowserAdd(source.replace("if(people.length !== 1)", "if(people.length > 1)")),/Cannot find exactly one/);
 assert.throws(()=>stageBrowserAdd(source.replace("web.getRange(target.row, 6).setValue('承認済み')","web.getRange(target.row, 6).setValue('却下')")),/Unexpected manual-approval/);
});
