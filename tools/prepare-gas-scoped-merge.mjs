#!/usr/bin/env node
/**
 * Prepare a review-only Code.gs from the actual, operator-exported GAS HEAD.
 * No network, secrets, deployment, or production Sheets access.
 *
 * Usage:
 *   node tools/prepare-gas-scoped-merge.mjs ./Code.gs ./Code.review.gs
 *
 * Merges only the differences between the repository's legacy and repaired
 * sources. A conflict or any change in core event actions FAILS CLOSED.
 * The original Code.gs is never edited.
 */
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base=resolve(root,'APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs');
const improved=resolve(root,'APPS_SCRIPT_Code_v1.9.6_DISABLE_NAME_ONLY_APPROVE.gs');
const [inputArg,outputArg]=process.argv.slice(2);
if(!inputArg||!outputArg){
  console.error('Usage: node tools/prepare-gas-scoped-merge.mjs ./Code.gs ./Code.review.gs');
  process.exit(2);
}
const input=resolve(inputArg),output=resolve(outputArg);
if(input===output || [base,improved].includes(output)){
  console.error('Refusing to overwrite the input, baseline or repaired source');
  process.exit(2);
}
let oldSource,currentSource,newSource;
try{
  oldSource=readFileSync(base,'utf8');
  currentSource=readFileSync(input,'utf8');
  newSource=readFileSync(improved,'utf8');
}catch(error){
  console.error('Cannot read all three sources:',error.code||error.message);
  process.exit(2);
}

const getConfig=(s,key)=>{
  const match=s.match(new RegExp('^var\\s+'+key+'\\s*=\\s*([\\x27\\x22])([^\\n]+?)\\1\\s*;', 'm'));
  return match?.[2]??null;
};
const sheetIds=['SHEET_ID','WEB_TAB'];
for(const key of sheetIds){
  const legacy=getConfig(oldSource,key);
  const repaired=getConfig(newSource,key);
  const existing=getConfig(currentSource,key);
  if(!legacy || legacy!==repaired || existing!==legacy){
    console.error('Cannot safely identify original spreadsheet setting:',key);
    process.exit(3);
  }
}
const countFn=(source,fn)=>(source.match(new RegExp('^function\\s+'+fn+'\\s*\\(','gm'))||[]).length;
for(const name of ['doPost','checkinAction_','gachaAction_']){
  if(countFn(currentSource,name)!==1 || countFn(oldSource,name)!==1 ||
     countFn(newSource,name)!==1){
    console.error('Ambiguous Apps Script function:',name);
    process.exit(3);
  }
}

// Preserve every existing function from checkinAction_ onward byte-for-byte.
// The verified patch is limited to registration and a small number of helpers.
const protectedTail=(source)=>{
  const start=source.indexOf('\nfunction checkinAction_(');
  return start<0?null:source.slice(start);
};
const temporary=mkdtempSync(join(tmpdir(),'mio-gas-merge-'));
try{
  const oldPath=join(temporary,'Code.legacy.gs');
  const currentPath=join(temporary,'Code.current.gs');
  const improvedPath=join(temporary,'Code.repaired.gs');
  writeFileSync(oldPath,oldSource,'utf8');
  writeFileSync(currentPath,currentSource,'utf8');
  writeFileSync(improvedPath,newSource,'utf8');
  const merge=spawnSync('git',['merge-file','-p','--diff3',currentPath,oldPath,improvedPath],
    {encoding:'utf8',maxBuffer:16*1024*1024});
  if(merge.error||merge.status!==0 || /^(?:<{7}|={7}|>{7})/m.test(merge.stdout||'')){
    console.error('Current GAS differs in a conflicting area. No output written.');
    process.exitCode=4;
  }else{
    const merged=merge.stdout;
    const oldTail=protectedTail(currentSource);
    if(!oldTail||protectedTail(merged)!==oldTail ||
       sheetIds.some(k=>getConfig(merged,k)!==getConfig(currentSource,k)) ||
       !merged.includes('if(!validPrevious)return json_({ok:false') ||
       !merged.includes('pendingReview:true,needsIdentityProof:true,autoApproved:false') ||
       !merged.includes('var existingLoginId=loginIdFormat_(web.getRange(foundRow,LOGIN_ID_COL).getDisplayValue());')){
      console.error('Protected GAS behavior changed or required enrollment guard is missing. No output written.');
      process.exitCode=5;
    }else{
      writeFileSync(output,merged,'utf8');
      console.log('REVIEW ONLY: wrote '+output);
      console.log('No deployment was made; verify live version and back up all GAS files first.');
    }
  }
}finally{rmSync(temporary,{recursive:true,force:true});}
