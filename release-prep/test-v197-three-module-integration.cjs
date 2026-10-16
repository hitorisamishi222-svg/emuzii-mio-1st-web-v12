// Integration tests for candidate Apps Script modules only. No Google Sheets/API calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sandbox={console,Date,JSON,Number,Math,String,Array,Error};
vm.createContext(sandbox);
for(const name of [
  'APPS_SCRIPT_Code_v1.9.7_MANUAL_IDENTITY_RELEASE.gs',
  'release-prep/DeviceRecoveryV197_SAFE_INTEGRATION_CANDIDATE.gs',
  'release-prep/BrowserAddV197_SAFE_CANDIDATE.gs'
])vm.runInContext(fs.readFileSync(name,'utf8'),sandbox,{filename:name});

const mk=(id,name,mio,status='承認待ち',member='未確認',device='未指定')=>{
  const r=Array(21).fill('');
  r[0]=id;r[2]=name;r[4]=new Date('2026-10-17T01:00:00Z');r[5]=status;
  r[6]=member;r[7]=mio;r[10]=mio;r[11]='確認済み';r[15]=mio;r[16]=device;
  return r;
};
const sample=()=>[
  mk('OLD','Maverick','MIO-0013','承認済み','確認済み','使用中'),
  mk('NEW','Maverick','MIO-0013'),
  mk('OTHER','Maverick','MIO-0020','承認済み','確認済み','使用中')
];
function harness(rows=sample()){
  const participant=[['MIO-0013','Maverick'],['MIO-0020','Maverick']];
  const otherData={checkin:[['MIO-0013','Maverick',31]],gacha:[['MIO-0013','Maverick',5]],fa:[['MIO-0013','Maverick','受付']]};
  const preserved=JSON.stringify(otherData);
  const auditRows=[['header']];
  let auditWriteFailure=false;
  const reviewRows=[Array(13).fill('header')];
  const base=(arr,row,col)=>({
    getValue:()=>arr[row-1]?.[col-1]??'',
    getDisplayValue:()=>String(arr[row-1]?.[col-1]??''),
    setValue(v){while(arr.length<row)arr.push([]);arr[row-1][col-1]=v;return this;},
    clearContent(){if(arr[row-1])arr[row-1][col-1]='';return this;},
    setValues(values){values.forEach((v,i)=>{while(arr.length<row+i)arr.push([]);for(let j=0;j<v.length;j++)arr[row+i-1][col+j-1]=v[j];});return this;}
  });
  const web={
    getName:()=> 'emuzii_Web登録',
    getRange:(row,col)=>base([null,...rows],row,col)
  };
  // Web mapping uses physical row 2 for rows[0].
  // [null,...rows] is rebuilt each time; mutate row arrays by reference.
  const review={
    getName:()=> 'emuzii_重複整理',
    getLastRow:()=>reviewRows.length,
    getRange:(row,col)=>({
      ...base(reviewRows,row,col),
      clearContent(){for(let i=row-1;i<reviewRows.length;i++)for(let j=col-1;j<13;j++)reviewRows[i][j]='';}
    })
  };
  const audit={
    getLastRow:()=>auditRows.length,
    appendRow:row=>auditRows.push([...row]),
    getRange:(row,col)=>({
      setValue(v){
        if(v==='追加完了'&&auditWriteFailure){auditWriteFailure=false;throw Error('simulated write error');}
        auditRows[row-1][col-1]=v;
      }
    })
  };
  const ss={getSheetByName:name=>
    name==='emuzii_Web登録'?web:
    name==='emuzii_重複整理'?review:
    name==='emuzii_端末切替履歴'?audit:null};
  sandbox.webActualRows_=()=>rows;
  sandbox.rows_=(ss,name)=>name==='emuzii_参加者'?participant:[];
  sandbox.ensureWebDerivedRow_=()=>{};
  sandbox.SpreadsheetApp={openById:()=>ss,flush:()=>{}};
  sandbox.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  sandbox.ScriptApp={getProjectTriggers:()=>[{getHandlerFunction:()=> 'webRecoveryOnEditBrowserPatchV189_'}]};
  sandbox.Logger={log:()=>{}};
  const rowIndex=webId=>rows.findIndex(r=>r[0]===webId)+2;
  const putReview=(webId,mio='MIO-0013',verified='確認済み')=>{
    const i=rowIndex(webId),r=rows[i-2];assert.ok(i>1);
    reviewRows[1]=[r[2],mio,webId,r[5],r[16],r[4],3,2,verified,'保留','','',i];
    return 2;
  };
  const edit=(action)=>sandbox.webRecoveryOnEditBrowserPatchV189_({
    range:{getNumRows:()=>1,getNumColumns:()=>1,getSheet:()=>review,getRow:()=>2,getColumn:()=>10},
    value:action
  });
  return {rows,reviewRows,auditRows,participant,otherData,preserved,ss,putReview,edit,
    failAudit(){auditWriteFailure=true;}};
}
let count=0;
function check(label,fn){fn();console.log('PASS '+(++count)+' '+label);}
check('valid additional pending browser keeps old and unrelated approved browser',()=>{
  const h=harness();h.putReview('NEW');
  h.edit('このブラウザを追加');
  assert.equal(h.rows[1][5],'承認済み');
  assert.equal(h.rows[1][16],'使用中');
  assert.equal(h.rows[1][6],'確認済み');
  assert.equal(h.rows[0][5],'承認済み');
  assert.equal(h.rows[2][5],'承認済み');
  assert.equal(h.reviewRows[1][8],'未確認');
  assert.equal(h.reviewRows[1][9],'保留');
  assert.match(h.reviewRows[1][10],/追加完了/);
  assert.equal(h.auditRows.at(-1)[6],'追加完了');
  assert.equal(JSON.stringify(h.otherData),h.preserved);
});
check('approval requires admin verification',()=>{
  const h=harness();h.putReview('NEW','MIO-0013','未確認');
  h.edit('このブラウザを追加');
  assert.equal(h.rows[1][5],'承認待ち');
  assert.match(h.reviewRows[1][10],/実行不可/);
});
check('stale review row cannot authorize after participant status change',()=>{
  const h=harness();h.putReview('NEW');
  h.rows[1][5]='却下';
  h.edit('このブラウザを追加');
  assert.equal(h.rows[1][5],'却下');
  assert.match(h.reviewRows[1][10],/候補一覧が更新/);
});
check('rejected historical browser never reapproves',()=>{
  const h=harness();
  h.rows[1][5]='却下';h.rows[1][16]='旧端末';
  h.putReview('NEW');h.edit('このブラウザを追加');
  assert.equal(h.rows[1][5],'却下');
  assert.match(h.reviewRows[1][10],/実行不可/);
  assert.equal(h.rows[0][5],'承認済み');
});
check('retired browser cannot sneak in with pending F state',()=>{
  const h=harness();h.rows[1][16]='旧端末';h.putReview('NEW');
  h.edit('このブラウザを追加');
  assert.equal(h.rows[1][5],'承認待ち');
  assert.match(h.reviewRows[1][10],/旧端末/);
});
check('P/H/K/L mismatch fails closed',()=>{
  const h=harness();h.rows[1][15]='MIO-0020';h.putReview('NEW');
  h.edit('このブラウザを追加');
  assert.equal(h.rows[1][5],'承認待ち');
  assert.match(h.reviewRows[1][10],/H\/K\/P\/L/);
});
check('duplicate Web-ID cannot receive privileges',()=>{
  const h=harness();h.rows[2][0]='NEW';h.putReview('NEW');
  h.edit('このブラウザを追加');
  assert.equal(h.rows[1][5],'承認待ち');
  assert.match(h.reviewRows[1][10],/一意/);
});
check('already approved browser may not be reapproved via pending flow',()=>{
  const h=harness();h.rows[1][5]='承認済み';h.putReview('NEW');
  h.edit('このブラウザを追加');
  assert.match(h.reviewRows[1][10],/承認待ち/);
});
check('additional approval restores original state if audit status write fails',()=>{
  const h=harness();h.putReview('NEW');const before=JSON.stringify(h.rows[1]);
  h.failAudit();h.edit('このブラウザを追加');
  assert.equal(JSON.stringify(h.rows[1]),before);
  assert.equal(h.rows[0][5],'承認済み');
  assert.equal(h.auditRows.at(-1)[6],'失敗・復旧済み');
});
check('explicit device switch retires same MIO only',()=>{
  const h=harness();h.putReview('NEW');h.edit('この端末へ切替');
  assert.equal(h.rows[0][5],'却下');assert.equal(h.rows[0][16],'旧端末');
  assert.equal(h.rows[1][5],'承認済み');assert.equal(h.rows[1][16],'使用中');
  assert.equal(h.rows[2][5],'承認済み');
  assert.equal(h.auditRows.at(-1)[6],'完了');
});
check('legacy setup functions cannot recreate triggers',()=>{
  assert.throws(()=>sandbox.setupV189Complete(),/禁止/);
  assert.throws(()=>sandbox.setupWebRecoveryV189_(),/禁止/);
  assert.throws(()=>sandbox.setupBrowserAddV189Patch(),/初期化/);
  assert.throws(()=>sandbox.webRecoveryOnEdit_({}),/停止済み/);
});
check('safe review refresh resets prior verification flag',()=>{
  const h=harness();h.putReview('NEW');
  h.reviewRows[1][8]='確認済み';
  sandbox.refreshDuplicateReviewV189_();
  const now=h.reviewRows.find(r=>r[2]==='NEW');
  assert.equal(now[8],'未確認');
});
check('single first-time pending registration is visible to operators',()=>{
  const h=harness([mk('FIRST','NewLiver','','承認待ち')]);
  sandbox.refreshBrowserAddReviewV189Patch_();
  assert.equal(h.reviewRows[1][2],'FIRST');
  assert.equal(h.reviewRows[1][8],'未確認');
  assert.equal(h.reviewRows[1][9],'保留');
});
check('single approved-first-time browser works only after participant roster linkage',()=>{
  const h=harness([mk('FIRST','Maverick','MIO-0013','承認待ち')]);
  h.putReview('FIRST');h.edit('このブラウザを追加');
  assert.equal(h.rows[0][5],'承認済み');
  assert.equal(h.rows[0][16],'使用中');
  assert.equal(h.auditRows.at(-1)[6],'追加完了');
});
check('first-time name absent from participant roster cannot be approved',()=>{
  const h=harness([mk('NEW','Unlisted','MIO-0199','承認待ち')]);
  h.putReview('NEW','MIO-0199');h.edit('このブラウザを追加');
  assert.equal(h.rows[0][5],'承認待ち');
  assert.match(h.reviewRows[1][10],/参加者のMIO-IDと名前/);
});
console.log('OK: '+count+' synthetic 3-module integration cases passed');
