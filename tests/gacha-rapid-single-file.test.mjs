import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../GAS_GachaRapid_SINGLE_20261030.gs',import.meta.url),'utf8');
const original=readFileSync(new URL('../GAS_GachaRapid_20261029.gs',import.meta.url),'utf8');
const html=readFileSync(new URL('../GachaRapidUI.html',import.meta.url),'utf8');

test('one-file GAS module compiles and includes exactly one admin backend',()=>{
 assert.doesNotThrow(()=>new Function('Session','DriveApp','SpreadsheetApp','LockService','ScriptApp','HtmlService',script));
 for(const fun of ['gachaRapidAdmin_','gachaRapidSnapshot','gachaRapidApproveAndGrant','gachaRapidOpen']){
  assert.equal((script.match(new RegExp('function '+fun+'\\(','g'))||[]).length,1);
 }
 assert.ok(script.includes("Session.getActiveUser().getEmail()"));
 assert.ok(script.includes("LockService.getDocumentLock()"));
 assert.ok(script.includes("var GACHA_RAPID_SHEET_ID="));
 assert.ok(!script.includes("createHtmlOutputFromFile("));
});
test('one-file dialog is byte-equivalent to reviewed UI and backend',()=>{
 const marker='HtmlService.createHtmlOutput(';
 const start=script.indexOf(marker);
 assert.ok(start>0);
 const text=script.slice(start+marker.length);
 const end=text.indexOf(').setWidth(1100).setHeight(680)');
 assert.ok(end>0);
 const embedded=JSON.parse(text.slice(0,end));
 assert.equal(embedded,html);
 const restored=script.replace(marker+JSON.stringify(html)+').setWidth(1100).setHeight(680)',
    "HtmlService.createHtmlOutputFromFile('GachaRapidUI').setWidth(1100).setHeight(680)");
 assert.equal(restored.slice(restored.indexOf('/**')),original);
 assert.match(embedded,/google\.script\.run/);
 assert.match(embedded,/🔐 承認・回数を確定/);
});
