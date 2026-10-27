import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Model of a Google spreadsheet, isolated from every real participant and GAS.
function harness(sourcePath='../APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs') {
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
  const code=readFileSync(new URL(sourcePath,import.meta.url),'utf8');
  vm.runInContext(code,ctx,{filename:'APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs'});
  const r=Array(8).fill('');
  r[0]=names.web;r[2]=names.name;r[5]='承認済み';r[6]='確認済み';r[7]=names.id;
  const grant=(key,mode='通常',prizeId='OLD')=>{
    const n=sheetData['emuzii_当選履歴'].length+1;
    sheetData['emuzii_当選履歴'].push([n.toString(16).padStart(32,'0'),names.web,names.id,names.name,mode,prizeId,'以前の景品',50,new Date(),n,'確定','N','',key]);
  };
  const draw=(mode='通常',drawId='f'.repeat(32))=>ctx.gachaAction_(ss,r,{action:'draw',mode,drawId});
  const catalog=()=>ctx.gachaAction_(ss,r,{action:'catalog'});
  return {sheetData,grant,draw,catalog,setGates:(normal,fest)=>{normalOpen=normal;festOpen=fest;},
    participantCatalog:(c,won)=>ctx.participantCatalog_(c,won),names};
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

test('every eligible subset of the real 16 + 11 prize-weight pattern totals exactly 100.00 percent',()=>{
  const {participantCatalog}=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  // Public probability settings only. No participant data or live draw history.
  const cases=[
    ['通常',[750,750,750,750,750,750,750,750,600,600,600,600,600,700,150,150]],
    ['ラキフェス',[800,800,800,800,800,2000,1000,1000,1000,500,500]]
  ];
  let subsets=0;
  for(const [label,weights] of cases) {
    const prizes=weights.map((units,i)=>({
      id:'P-'+i,name:'景品'+i,rarity:'N',units,duplicateKey:'key-'+i,stock:null,image:''
    }));
    assert.equal(weights.reduce((a,b)=>a+b,0),10000);
    for(let mask=1;mask<(1<<weights.length);mask++) {
      const won={};
      for(let i=0;i<weights.length;i++)if(!(mask & (1<<i)))won['key-'+i]=true;
      const result=participantCatalog({ready:true,prizes},won);
      const sum=result.prizes.reduce((a,p)=>a+Math.round(p.chance*100),0);
      if(sum!==10000) throw Error(label+' subset '+mask+' total '+sum+' != 10000');
      for(const p of result.prizes){
        if(!Number.isInteger(Math.round(p.chance*100))||p.chance<0)
          throw Error(label+' subset '+mask+' invalid prize chance');
      }
      subsets++;
    }
  }
  assert.equal(subsets,67582);
});

test('display rounding never mutates source weights, draw identities or prize order',()=>{
  const {participantCatalog}=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  const prizes=[
    {id:'A',name:'景品A',units:750,duplicateKey:'a',rarity:'N',image:''},
    {id:'B',name:'景品B',units:750,duplicateKey:'b',rarity:'N',image:''},
    {id:'C',name:'景品C',units:750,duplicateKey:'c',rarity:'N',image:''}
  ];
  const original=JSON.stringify(prizes);
  const out=participantCatalog({ready:true,prizes},{});
  assert.equal(out.prizes.reduce((n,p)=>n+Math.round(p.chance*100),0),10000);
  assert.deepEqual(Array.from(out.prizes,p=>p.id),['A','B','C']);
  assert.equal(JSON.stringify(prizes),original);
});

test('all prizes already won displays no available prize and no draw-ready state',()=>{
  const {participantCatalog}=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  const res=participantCatalog({ready:true,prizes:[
    {id:'A',name:'A',units:10000,duplicateKey:'a'}
  ]},{a:true});
  assert.equal(res.ready,false);
  assert.equal(res.total,0);
  assert.equal(res.prizes.length,0);
});

test('candidate backend advertises revision only with cross-mode nonduplication in its actual catalog',()=>{
  const legacy=harness().catalog();
  assert.equal(legacy.normal.safetyRevision,undefined);
  assert.equal(legacy.fest.safetyRevision,undefined);
  const staged=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  const c=staged.catalog();
  assert.equal(c.normal.safetyRevision,'mio-crossmode-nodup-v1');
  assert.equal(c.fest.safetyRevision,'mio-crossmode-nodup-v1');
  staged.grant('shared-a','通常','N-A');
  const after=staged.catalog();
  assert.equal(after.normal.prizes.some(p=>p.id==='N-A'),false);
  assert.equal(after.fest.prizes.some(p=>p.id==='F-A'),false);
  assert.equal(after.normal.safetyRevision,'mio-crossmode-nodup-v1');
  assert.equal(after.fest.safetyRevision,'mio-crossmode-nodup-v1');
});

test('staged GAS logs effective 100% odds, not original 50%, when only one normal prize remains',()=>{
  const x=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  x.grant('shared-a','通常','N-A');
  const catalog=x.catalog();
  assert.equal(catalog.normal.prizes.length,1);
  assert.equal(catalog.normal.prizes[0].chance,100);
  const out=x.draw('通常','a'.repeat(32));
  assert.equal(out.ok,true);
  assert.equal(out.prize,'通常B');
  const last=x.sheetData['emuzii_当選履歴'].at(-1);
  assert.equal(last[7],100);
  assert.equal(last[5],'N-B');
  assert.equal(x.sheetData['emuzii_当選履歴'].length,2);
});

test('staged GAS logs fifth-draw festival probability after cross-mode win exclusion',()=>{
  const x=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  x.grant('shared-a','通常','N-A');
  x.grant('historical-b');
  x.grant('historical-c');
  x.grant('historical-d');
  const c=x.catalog();
  assert.equal(c.fest.prizes.length,1);
  assert.equal(c.fest.prizes[0].chance,100);
  const out=x.draw('ラキフェス','b'.repeat(32));
  assert.equal(out.ok,true);
  assert.equal(out.prize,'豪華B');
  assert.equal(out.ordinal,5);
  const row=x.sheetData['emuzii_当選履歴'].at(-1);
  assert.equal(row[7],100);
  assert.equal(row[4],'ラキフェス');
  assert.equal(row[13],'fest-b');
});

test('replaying same draw ID never rewrites its historical win probability',()=>{
  const x=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  x.grant('shared-a','通常','N-A');
  const id='a'.repeat(32);
  assert.equal(x.draw('通常',id).ok,true);
  const saved=JSON.stringify(x.sheetData['emuzii_当選履歴']);
  const replay=x.draw('通常',id);
  assert.equal(replay.ok,true);
  assert.equal(replay.replayed,true);
  assert.equal(JSON.stringify(x.sheetData['emuzii_当選履歴']),saved);
});


test('a prize previously won by another participant is still available for this participant',()=>{
  const x=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  x.sheetData['emuzii_景品設定'][0][6]=1;
  x.sheetData['emuzii_当選履歴'].push([
    'd'.repeat(32),'MIO-W-'+'d'.repeat(24),'MIO-0099','別の参加者',
    '通常','N-A','通常A',50,new Date(),1,'確定','N','','shared-a'
  ]);
  const c=x.catalog();
  assert.equal(c.remaining,8,'another participant must not spend our rights');
  assert.equal(c.normal.ready,true);
  assert.deepEqual(Array.from(c.normal.prizes,p=>p.id),['N-A','N-B']);
  assert.deepEqual(Array.from(c.normal.prizes,p=>p.chance),[50,50]);
  const result=x.draw('通常','a'.repeat(32));
  assert.equal(result.ok,true);
  assert.equal(result.prize,'通常A','same item is available independently to another user');
  assert.equal(result.remaining,7);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,2);
  assert.equal(x.sheetData['emuzii_当選履歴'][1][2],x.names.id);
  const after=x.catalog();
  assert.deepEqual(Array.from(after.normal.prizes,p=>p.id),['N-B']);
  assert.deepEqual(Array.from(after.fest.prizes,p=>p.id),['F-B'],
    'once personally won, the shared item must disappear from festival as well');
});

test('global quantity metadata never removes items or changes odds for a participant',()=>{
  const x=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  x.sheetData['emuzii_景品設定'][0][6]=0;
  x.sheetData['emuzii_景品設定'][1][6]=1;
  x.sheetData['emuzii_景品設定'][2][6]='invalid legacy value';
  const c=x.catalog();
  assert.equal(c.normal.ready,true);
  assert.equal(c.fest.ready,true);
  assert.deepEqual(Array.from(c.normal.prizes,p=>p.chance),[50,50]);
  assert.deepEqual(Array.from(c.fest.prizes,p=>p.chance),[50,50]);
  assert.equal(c.normal.prizes.some(p=>Object.hasOwn(p,'stock')),false);
  const first=x.draw('通常','b'.repeat(32));
  assert.equal(first.ok,true);
  assert.equal(first.prize,'通常A');
  const second=x.draw('通常','c'.repeat(32));
  assert.equal(second.ok,true);
  assert.equal(second.prize,'通常B');
  assert.equal(x.catalog().normal.ready,false);
});

test('one participant can receive every distinct key once, never duplicate it across modes',()=>{
  const x=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  x.grant('shared-a','通常','N-A');
  x.grant('historical-b');
  x.grant('historical-c');
  x.grant('historical-d');
  let c=x.catalog();
  assert.equal(c.festUnlocked,true);
  assert.deepEqual(Array.from(c.normal.prizes,p=>p.id),['N-B']);
  assert.deepEqual(Array.from(c.fest.prizes,p=>p.id),['F-B']);
  const festival=x.draw('ラキフェス','c'.repeat(32));
  assert.equal(festival.ok,true);
  assert.equal(festival.prize,'豪華B');
  c=x.catalog();
  assert.equal(c.fest.ready,false,'festival has been collected by this user');
  assert.equal(c.normal.ready,true,'normal still has an unowned prize');
  assert.deepEqual(Array.from(c.normal.prizes,p=>p.id),['N-B']);
  const repeat=x.draw('ラキフェス','e'.repeat(32));
  assert.equal(repeat.ok,false);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,5,'no extra history or right consumption');
});

test('only the user who owns all normal prizes must stop; unrelated histories do not stop a fresh user',()=>{
  const x=harness('../release-prep/gacha-probability-display-v191-candidate.gs');
  x.grant('shared-a','通常','N-A');
  x.grant('normal-b','通常','N-B');
  const c=x.catalog();
  assert.equal(c.normal.ready,false);
  assert.equal(c.normal.prizes.length,0);
  const before=x.sheetData['emuzii_当選履歴'].length;
  const result=x.draw('通常','f'.repeat(32));
  assert.equal(result.ok,false);
  assert.equal(x.sheetData['emuzii_当選履歴'].length,before);
});
