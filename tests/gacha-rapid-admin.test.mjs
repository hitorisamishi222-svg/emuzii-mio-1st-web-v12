import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../GAS_GachaRapid_20261029.gs',import.meta.url),'utf8');
const makeModule=new Function('Session','DriveApp','SpreadsheetApp','LockService','ScriptApp','HtmlService',
  source+'\nreturn {admin:gachaRapidAdmin_,snapshot:gachaRapidSnapshot,approve:gachaRapidApproveAndGrant};');
const W='MIO-W-0123456789abcdef01234567';

function fixture(opt={}){
  const name=opt.name??'ユーリ',webName=opt.webName??name,master=opt.master??'MIO-0017';
  const m1=opt.m1??2,m3=opt.m3??0;
  const web=[W,'a'.repeat(64),webName,'申告なし',new Date('2026-10-29T00:00:00Z'),
    opt.approval??'承認待ち','未確認','',null,'既存一致',W,'確認待ち',null,'','','',
    opt.device??'未指定','','','',''];
  const rights=[master,name,m1,m3,0,m1+3*m3,0,m1+3*m3,0,0,0,0,'OK','OK',0,0,0];
  const sheets={
    'emuzii_Web登録':[web],
    'emuzii_参加者':[[master,name]],
    'emuzii_ガチャ':[rights],
    'emuzii_当選履歴':[],
    'emuzii_管理画面':[]
  };
  if(opt.conflictingWeb)sheets['emuzii_Web登録'].push([
    'MIO-W-aaaaaaaaaaaaaaaaaaaaaaaa','b'.repeat(64),name,'申告なし',null,
    '承認済み','確認済み','MIO-0022','','','MIO-0022','確認済み']);
  const audit={appendRow(row){audit.events.push(row)},events:[],getRange(){return {setValues(){}}},setFrozenRows(){}};
  let lockCount=0;
  function readAt(title,row,col){
    const saved=sheets[title]?.[row-2]?.[col-1]??'';
    if(opt.preserveFormulaCheck&&title==='emuzii_Web登録'){
      const w=sheets[title]?.[row-2];
      if(w&&col===11)return w[7]||W; // K: formula derived from linked MIO-ID, otherwise Web ID
      if(w&&col===12)return w[5]==='承認済み'?'確認済み':'確認待ち'; // L: formula
    }
    if(saved!==''||row<3)return saved;
    const person=sheets['emuzii_参加者'][row-2];
    if(!person?.[1])return saved;
    if(title==='emuzii_参加者'&&col===1)return 'MIO-'+String(row-1).padStart(4,'0');
    if(title==='emuzii_ガチャ'&&col===1)return 'MIO-'+String(row-1).padStart(4,'0');
    if(title==='emuzii_ガチャ'&&col===2)return person[1];
    return saved;
  }
  const access=title=>({
    getLastRow:()=>sheets[title].length+1,
    getRange(a,b,c=1,d=1){
      let row,col;
      if(typeof a==='string'){const found=/^([A-Z]+)(\d+)$/.exec(a);if(!found)throw Error('unsupported range');
        row=Number(found[2]);col=found[1].charCodeAt(0)-64;
      }else{row=a;col=b;}
      return {
        getValues:()=>Array.from({length:c},(_,i)=>Array.from({length:d},(_,j)=>readAt(title,row+i,col+j))),
        getDisplayValues:()=>Array.from({length:c},(_,i)=>Array.from({length:d},(_,j)=>String(readAt(title,row+i,col+j)))),
        getValue:()=>readAt(title,row,col)||false,
        getDisplayValue:()=>String(readAt(title,row,col)),
        getFormula:()=>opt.preserveFormulaCheck&&title==='emuzii_Web登録'&&[11,12].includes(col)?'=SAFE_LIVE_FORMULA()':row>=3?'=MIO_FORMULA()':'',
        setValue(value){
          if(opt.preserveFormulaCheck&&title==='emuzii_Web登録'&&[11,12,17].includes(col))
            throw Error('Web登録のK/L/Qを書き換えてはいけません');
          if(!sheets[title][row-2])sheets[title][row-2]=[];sheets[title][row-2][col-1]=value}
      };
    }
  });
  const session={getActiveUser:()=>({getEmail:()=>opt.user??'rineyuuzi6@gmail.com'})};
  const drive={getFileById:()=>({getOwner:()=>({getEmail:()=>'mio-owner@example.com'}),
    getEditors:()=>[{getEmail:()=>'rineyuuzi6@gmail.com'}]})};
  const spreadsheet={openById:()=>({
    getSheetByName:x=>sheets[x]?access(x):x==='emuzii_ガチャ緊急操作履歴'?audit:null,
    insertSheet:x=>x==='emuzii_ガチャ緊急操作履歴'?audit:null
  }),flush(){}};
  const locker={getDocumentLock:()=>({tryLock:()=>{lockCount++;return true},
    releaseLock:()=>{lockCount--}})};
  const api=makeModule(session,drive,spreadsheet,locker,{},{});
  const req=(over={})=>({webId:W,name,targetId:master,m1,m3,expectedM1:m1,expectedM3:m3,verified:true,...over});
  return {api,req,sheets,audit,locked:()=>lockCount};
}

function rejectsWithoutChanges(label,opts,override,message){
  test(label,()=>{
    const x=fixture(opts);
    const before=JSON.stringify(x.sheets);
    assert.throws(()=>x.api.approve(x.req(override)),new RegExp(message));
    assert.equal(JSON.stringify(x.sheets),before);
    assert.equal(x.locked(),0);
  });
}

test('existing two draws can be approved without double credit',()=>{
  const x=fixture();
  const out=x.api.approve(x.req());
  assert.equal(out.rights,2);
  assert.equal(x.sheets['emuzii_ガチャ'][0][2],2);
  assert.equal(x.sheets['emuzii_Web登録'][0][5],'承認済み');
  assert.equal(x.sheets['emuzii_Web登録'][0][7],'MIO-0017');
  assert.equal(x.audit.events.length,1);
  assert.equal(x.locked(),0);
});
test('reviewed three draws increase cumulative entitlement once',()=>{
  const x=fixture();
  const out=x.api.approve(x.req({m1:3}));
  assert.equal(out.rights,3);
  assert.equal(x.sheets['emuzii_ガチャ'][0][2],3);
});
test('snapshot excludes Web authentication token hashes',()=>{
  const x=fixture();
  const out=x.api.snapshot();
  assert.equal(out.rights[0].remaining,2);
  assert.equal(out.normalOpen,false);
  assert.equal(out.festOpen,false);
  assert.equal(JSON.stringify(out).includes('a'.repeat(64)),false);
});
rejectsWithoutChanges('outsider cannot modify accounts',{user:'attacker@example.com'},{},'管理者2人以外');
rejectsWithoutChanges('Google identity missing blocks actions',{user:''},{},'Googleアカウント');
rejectsWithoutChanges('requires explicit verification',{}, {verified:false},'本人確認');
rejectsWithoutChanges('rejects concurrent updates',{m1:3},{expectedM1:2},'別の管理者');
rejectsWithoutChanges('rejects altered ColorSing name',{webName:'別人'}, {},'登録名が変更');
rejectsWithoutChanges('cannot allocate NEW identity over existing one',{}, {targetId:'NEW'},'既存MIO-ID');
rejectsWithoutChanges('cannot reassign another identity',{}, {targetId:'MIO-0044'},'登録名とMIO-ID');
rejectsWithoutChanges('rejects conflicting approved device',{conflictingWeb:true},{},'同名・類似名の別ID');
rejectsWithoutChanges('rights cannot decrease',{}, {m1:1},'付与数の減少');
rejectsWithoutChanges('fractional entitlement rejected',{}, {m1:2.5},'口数は');
rejectsWithoutChanges('excessive entitlement rejected',{}, {m1:50,m3:50},'口数が不正');
rejectsWithoutChanges('rejects unidentified placeholder Web ID',{webName:W,name:W},{},'ColorSing名または端末認証');
rejectsWithoutChanges('retired device is not silently reapproved',{device:'旧端末'},{},'旧端末の登録');

test('new gacha-only member gets next existing formula-backed MIO-ID once',()=>{
  const x=fixture({name:'たけ',m1:0,m3:0});
  x.sheets['emuzii_参加者'][0][1]='既存の参加者';
  x.sheets['emuzii_ガチャ'][0][1]='既存の参加者';
  x.sheets['emuzii_参加者'].push(['','']);
  x.sheets['emuzii_ガチャ'].push(['','',0,0,0,0,0,0,0,0,0,0,'OK','OK']);
  const out=x.api.approve(x.req({targetId:'NEW',m1:1,m3:0,expectedM1:0,expectedM3:0}));
  assert.equal(out.masterId,'MIO-0002');
  assert.equal(out.rights,1);
  assert.equal(x.sheets['emuzii_参加者'][1][1],'たけ');
  assert.equal(x.sheets['emuzii_ガチャ'][1][2],1);
  assert.equal(x.sheets['emuzii_Web登録'][0][7],'MIO-0002');
  assert.equal(x.sheets['emuzii_Web登録'][0][10],'MIO-0002');
  assert.equal(x.audit.events.length,1);
  assert.equal(x.locked(),0);
  assert.throws(()=>x.api.approve(x.req({targetId:'NEW',m1:1,expectedM1:0})),/承認済みの参加者ID/);
  assert.equal(x.audit.events.length,1);
});
test('visually similar existing name blocks NEW participant ID',()=>{
  const x=fixture({name:'たけ'});
  x.sheets['emuzii_参加者'][0][1]='たけ✨';
  x.sheets['emuzii_ガチャ'][0][1]='たけ✨';
  const before=JSON.stringify(x.sheets);
  assert.throws(()=>x.api.approve(x.req({targetId:'NEW'})),/同名・類似名/);
  assert.equal(JSON.stringify(x.sheets),before);
});
test('similarly decorated approved other account blocks transfer',()=>{
  const x=fixture({name:'たけ'});
  x.sheets['emuzii_Web登録'].push([
    'MIO-W-aaaaaaaaaaaaaaaaaaaaaaaa','b'.repeat(64),'たけ🌟','申告なし',new Date(),
    '承認済み','確認済み','MIO-0044','','','MIO-0044','確認済み']);
  const before=JSON.stringify(x.sheets);
  assert.throws(()=>x.api.approve(x.req()),/同名・類似名の別ID/);
  assert.equal(JSON.stringify(x.sheets),before);
});

test('empty nickname row with orphaned personal data is not overwritten',()=>{
  const x=fixture({name:'たけ',m1:0,m3:0});
  x.sheets['emuzii_参加者'][0][1]='既存の参加者';
  x.sheets['emuzii_ガチャ'][0][1]='既存の参加者';
  x.sheets['emuzii_参加者'].push(['','','過去の非表示データ']);
  x.sheets['emuzii_ガチャ'].push(['','',0,0,0,0,0,0,0,0,0,0,'OK','OK']);
  const before=JSON.stringify(x.sheets);
  assert.throws(()=>x.api.approve(x.req({targetId:'NEW',m1:1,expectedM1:0})),/過去の記録/);
  assert.equal(JSON.stringify(x.sheets),before);
  assert.equal(x.audit.events.length,0);
});
test('gacha bonus on unassigned row prevents NEW participant overwrite',()=>{
  const x=fixture({name:'たけ',m1:0,m3:0});
  x.sheets['emuzii_参加者'][0][1]='既存の参加者';
  x.sheets['emuzii_ガチャ'][0][1]='既存の参加者';
  x.sheets['emuzii_参加者'].push(['','']);
  x.sheets['emuzii_ガチャ'].push(['','',0,0,0,0,0,0,0,0,0,0,'OK','OK',3,0,0]);
  const before=JSON.stringify(x.sheets);
  assert.throws(()=>x.api.approve(x.req({targetId:'NEW',m1:1,expectedM1:0})),/既存の回数・履歴/);
  assert.equal(JSON.stringify(x.sheets),before);
  assert.equal(x.audit.events.length,0);
});

test('purchase draw count and total rights remain distinct when bonuses exist',()=>{
  const x=fixture();
  x.sheets['emuzii_ガチャ'][0][5]=22;
  x.sheets['emuzii_ガチャ'][0][7]=22;
  const result=x.api.approve(x.req());
  assert.equal(result.purchasedDraws,2);
  assert.equal(result.totalRights,22);
  assert.equal(result.remaining,22);
  assert.equal(result.rights,2);
  assert.equal(x.sheets['emuzii_ガチャ'][0][5],22);
  assert.equal(x.audit.events.length,1);
});

test('live Web registry formula columns K/L and operator override Q are never overwritten',()=>{
  const x=fixture({preserveFormulaCheck:true});
  const out=x.api.approve(x.req({m1:3}));
  assert.equal(out.ok,true);
  assert.equal(x.sheets['emuzii_Web登録'][0][10],W); // mock holds formula-managed source, not replaced
  assert.equal(x.sheets['emuzii_Web登録'][0][11],'確認待ち');
  assert.equal(x.sheets['emuzii_Web登録'][0][16],'未指定');
  assert.equal(x.sheets['emuzii_Web登録'][0][5],'承認済み');
  assert.equal(x.sheets['emuzii_Web登録'][0][7],'MIO-0017');
  assert.equal(x.sheets['emuzii_ガチャ'][0][2],3);
});
