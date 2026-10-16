// Synthetic Google Apps Script gacha management tests. No production data.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={console,Date,JSON,Number,Math,String,Array,Error};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('release-prep/GachaAdminV188-FULL-REPLACE.gs','utf8'),sandbox);
let cases=0;function check(name,f){f();console.log('PASS '+(++cases)+' '+name)}
function mock({duplicated=false,failAudit=false,failRows=false}={}){
  const adminCells={J21:'MIO-0013',J23:2,J24:'記念付与',J25:true,L25:''};
  let balance=1,history=[],attempts=0,flushes=0;
  const playerRows=[['MIO-0013','SampleUser'],...(duplicated?[['MIO-0013','SampleUser']]:[])];
  function cell(key){
    return {getValue:()=>adminCells[key],getDisplayValue:()=>String(adminCells[key]??''),
      setValue(v){adminCells[key]=v;return this},clearContent(){adminCells[key]='';return this}};
  }
  const admin={
    getName:()=> 'emuzii_管理画面',
    getParent:()=>ss,
    getRange:(key)=>cell(key)
  };
  const gacha={
    getLastRow:()=>playerRows.length+1,
    getRange:(row,col,ncolsOrNumRows,cols)=>{
      if(row===2&&col===1&&cols===17)return {getValues:()=>playerRows.map(r=>{
        const output=Array(17).fill('');output[0]=r[0];output[1]=r[1];return output;
      })};
      if(row===2&&col===15)return {getValue:()=>balance,setValue:v=>{balance=v;return this}};
      if(row===2&&col===6)return {getValue:()=>5};
      if(row===2&&col===8)return {getValue:()=>2};
      throw Error('Unexpected gacha range '+[row,col,cols].join(','));
    }
  };
  const audit={appendRow:r=>{attempts++;if(failAudit)throw Error('simulated audit failure');history.push([...r])}};
  const ss={getSheetByName:name=>{
    if(name==='emuzii_管理画面')return admin;
    if(name==='emuzii_ガチャ')return gacha;
    if(name==='emuzii_ガチャ付与履歴')return failRows?null:audit;
    return null;
  }};
  sandbox.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  sandbox.SpreadsheetApp={flush:()=>{flushes++}};
  const edit=value=>sandbox.handleGachaAdminEdit_({range:{getSheet:()=>admin,getA1Notation:()=> 'J25'},value});
  return {ss,adminCells,edit,get balance(){return balance},get history(){return history},get attempts(){return attempts}};
}
check('valid grant writes exactly once to one participant and audit',()=>{
  const t=mock();
  assert.equal(t.edit('TRUE'),true);
  assert.equal(t.balance,3);
  assert.equal(t.history.length,1);
  assert.equal(t.history[0][1],'MIO-0013');
  assert.equal(t.history[0][3],2);
  assert.equal(t.adminCells.J25,false);
  assert.equal(t.adminCells.J23,'');
  assert.equal(t.adminCells.J24,'');
});
check('gacha grant rejects nonexistent or duplicate participant MIO ID',()=>{
  const t=mock({duplicated:true});
  t.edit('TRUE');
  assert.equal(t.balance,1);
  assert.equal(t.history.length,0);
  assert.match(t.adminCells.L25,/重複/);
});
check('invalid grant amount fails without participant mutation',()=>{
  const t=mock();t.adminCells.J23=0;
  t.edit('TRUE');
  assert.equal(t.balance,1);
  assert.equal(t.history.length,0);
  assert.match(t.adminCells.L25,/1〜100/);
});
check('audit failure rolls back the count and reports failure',()=>{
  const t=mock({failAudit:true});
  t.edit('TRUE');
  assert.equal(t.balance,1);
  assert.equal(t.history.length,0);
  assert.match(t.adminCells.L25,/simulated audit failure/);
});
check('absent audit tab fails without granting',()=>{
  const t=mock({failRows:true});
  t.edit('TRUE');
  assert.equal(t.balance,1);
  assert.equal(t.history.length,0);
  assert.match(t.adminCells.L25,/付与履歴シート/);
});
check('unchecked action never invokes a grant',()=>{
  const t=mock();
  assert.equal(t.edit('FALSE'),false);
  assert.equal(t.balance,1);
  assert.equal(t.history.length,0);
});
check('invalid MIO ID never grants even if name is known',()=>{
  const t=mock();t.adminCells.J21='MIO-9999';
  t.edit('TRUE');
  assert.equal(t.balance,1);
  assert.equal(t.history.length,0);
  assert.match(t.adminCells.L25,/対象参加者がいません/);
});
console.log('PASS: '+cases+' actual gacha addon synthetic grant cases');
