import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Model of a Google spreadsheet, isolated from every real participant and GAS.
function harness() {
  const names={web:'MIO-W-'+ 'a'.repeat(24),id:'MIO-0003',name:'テスト参加者'};
  const sheetData={
    'emuzii_参加者':[[names.id,names.name]],
    'emuzii_ガチャ':[[names.id,names.name,'','','',8,0,0,0,0,0,0,'OK','OK']],
    'emuzii_景品設定':[
      ['通常','N-A','通常A','N',50,true,'','','','shared-a'],
      ['通常','N-B','通常B','R',50,true,'','','','normal-b'],
      ['ラキフェス','F-A','豪華A','UR',50,true,'','','','shared-a'],
      ['ラキフェス','F-B','豪華B','SR',50,true,'','','','fest-b']
    ],
    'emuzii_当選履歴':[]
  };
  let normalOpen=true,festOpen=true;
  const sheets={};
  for(const [name,rows] of Object.entries(sheetData)){
    sheets[name]={
      getLastRow:()=>rows.length+1,
      getLastColumn:()=>Math.max(14,...rows.map(r=>r.length)),
      getRange:(...args)=>({
        getValues:()=>{
          const from=args[0]; const n=args[2] || rows.length;
          return rows.slice(from-2,from-2+n);
        },
        getValue:()=>null
      }),
      appendRow:(row)=>{rows.push(row)}
    };
  }
  sheets['emuzii_管理画面']={getRange:()=>({getValue:()=>5})};
  const ss={getSheetByName:(name)=>sheets[name]||null};
  const ctx=vm.createContext({
    console,Date,Math,Number,String,Object,Array,RegExp,
    Utilities:{
      DigestAlgorithm:{SHA_256:'SHA_256'},
      computeDigest:()=>[0,0,0,0],
      getUuid:()=> 'test-guid'
    },
    SpreadsheetApp:{flush(){}},
    gachaOpenState_:()=>({normalOpen,festOpen})
  });
  const code=readFileSync(new URL('../APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs',import.meta.url),'utf8');
  vm.runInContext(code,ctx,{filename:'APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs'});
  const r=Array(8).fill('');
  r[0]=names.web;r[2]=names.name;r[5]='承認済み';r[6]='確認済み';r[7]=names.id;
  const grant=(key,mode='通常',prizeId='OLD')=>{
    const n=sheetData['emuzii_当選履歴'].length+1;
    sheetData['emuzii_当選履歴'].push([n.toString(16).padStart(32,'0'),names.web,names.id,names.name,mode,prizeId,'以前の景品',50,new Date(),n,'確定','N','',key]);
  };
  const draw=(mode='通常',drawId='f'.repeat(32))=>ctx.gachaAction_(ss,r,{action:'draw',mode,drawId});
  const catalog=()=>ctx.gachaAction_(ss,r,{action:'catalog'});
  return {sheetData,grant,draw,catalog,setGates:(normal,fest)=>{normalOpen=normal;festOpen=fest;},names};
}

test('won normal prize is removed; effective probability of only remaining normal prize is 100%',()=>{
  const x=harness();x.grant('shared-a','通常','N-A');
  const c=x.catalog();
  assert.equal(c.normal.ready,true);
  assert.equal(c.normal.prizes.length,1);
  assert.equal(c.normal.prizes[0].name,'通常B');
  assert.equal(c.normal.prizes[0].chance,100);
  const outcome=x.draw('通常');
  assert.equal(outcome.ok,true);
  assert.equal(outcome.prize,'通常B');
  assert.equal(x.sheetData['emuzii_当選履歴'].length,2);
});

test('cross-mode duplicate key removes a normal win from fest before the 5th draw',()=>{
  const x=harness();x.grant('shared-a','通常','N-A');
  x.grant('historical-b');x.grant('historical-c');x.grant('historical-d');
  const c=x.catalog();
  assert.equal(c.festUnlocked,true);
  assert.equal(c.fest.prizes.length,1);
  assert.equal(c.fest.prizes[0].name,'豪華B');
  assert.equal(c.fest.prizes[0].chance,100);
  const outcome=x.draw('ラキフェス');
  assert.equal(outcome.ok,true);
  assert.equal(outcome.prize,'豪華B');
  assert.equal(outcome.ordinal,5);
});

test('fest draw is blocked before 5th Web draw and rights remain unchanged',()=>{
  const x=harness();
  x.grant('historical-a');x.grant('historical-b');x.grant('historical-c');
  const before=x.sheetData['emuzii_当選履歴'].length;
  const outcome=x.draw('ラキフェス');
  assert.equal(outcome.ok,false);
  assert.match(outcome.error,/5回目/);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,before);
});

test('all collected normal prizes cause a stopped draw with no extra history row',()=>{
  const x=harness();x.grant('shared-a','通常','N-A');x.grant('normal-b','通常','N-B');
  assert.equal(x.catalog().normal.ready,false);
  const before=x.sheetData['emuzii_当選履歴'].length;
  const outcome=x.draw('通常');
  assert.equal(outcome.ok,false);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,before);
});

test('exact replay reuses recorded outcome when both gates are closed',()=>{
  const x=harness();x.grant('shared-a','通常','N-A');
  const row=x.sheetData['emuzii_当選履歴'][0];
  x.setGates(false,false);
  const before=x.sheetData['emuzii_当選履歴'].length;
  const outcome=x.draw('通常',row[0]);
  assert.equal(outcome.ok,true);
  assert.equal(outcome.replayed,true);
  assert.equal(outcome.drawId,row[0]);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,before);
});

test('a recorded draw cannot be replayed using the wrong mode',()=>{
  const x=harness();x.grant('shared-a','通常','N-A');
  const row=x.sheetData['emuzii_当選履歴'][0];
  const outcome=x.draw('ラキフェス',row[0]);
  assert.equal(outcome.ok,false);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,1);
});

test('closed admin gate blocks new draw with no rights spent',()=>{
  const x=harness();x.setGates(false,false);
  const outcome=x.draw('通常');
  assert.equal(outcome.ok,false);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,0);
});

test('a different winning prize key never reappears in same mode',()=>{
  const x=harness();
  const first=x.draw('通常','a'.repeat(32));
  assert.equal(first.prize,'通常A');
  const second=x.draw('通常','b'.repeat(32));
  assert.equal(second.prize,'通常B');
  assert.notEqual(first.prize,second.prize);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,2);
});
