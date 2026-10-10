/**
 * Generates a REVIEW ONLY full candidate from an exact exported
 * production BrowserAddV189Patch.gs file. Does not call GAS or Sheets.
 * Refuses to overwrite input or accept changed/unknown anchors.
 *
 * Usage: node release-prep/build-browseradd-v199.mjs ./BrowserAddV189Patch.gs
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join,basename} from 'node:path';

const funcStart='function assertBrowserSlotsBeforeManualAddV199_(';
const guardCode=readFileSync(new URL('./BrowserAddV189Patch_5slot_guard_PROPOSAL.gs',import.meta.url),'utf8');
const guardStart=guardCode.indexOf(funcStart);
const guardEnd=guardCode.indexOf('\n}\n',guardStart);
if(guardStart<0||guardEnd<0)throw Error('Guard helper is not uniquely extractable');
const guard=guardCode.slice(guardStart,guardEnd+3);

export function stageBrowserAdd(source){
 if(typeof source!=='string'||source.length<3500)throw Error('Missing or truncated original BrowserAddV189Patch.gs');
 if((source.match(/function approveAdditionalBrowserV189Patch_\(/g)||[]).length!==1)
   throw Error('Unexpected admin add function signature');
 if((source.match(/function switchApprovedWebRegistrationV189_\(/g)||[]).length!==0)
   throw Error('Mixed recovery file detected: never patch the wrong .gs');
 if(source.includes('assertBrowserSlotsBeforeManualAddV199_'))
   throw Error('Already patched: do not duplicate');
 const start=source.indexOf('function approveAdditionalBrowserV189Patch_(');
 const end=source.indexOf('\nfunction ',start+1);
 const finish=end>=0?end:source.length;
 const functionText=source.slice(start,finish);
 const confirm=/if\s*\(\s*people\.length\s*!==\s*1\s*\)\s*throw Error\('参加者のMIO-IDと名前を一意に照合できません'\);/;
 const match=functionText.match(confirm);
 if(!match||functionText.match(new RegExp(confirm.source,'g'))?.length!==1)
   throw Error('Cannot find exactly one manager-verified MIO/name anchor');
 const tail=functionText.slice(functionText.indexOf(match[0])+match[0].length);
 const anchor=tail.match(/\n[ \t]*var sameApproved\s*=/);
 if(!anchor)throw Error('Cannot find manual-add approval boundary');
 const pos=start+functionText.indexOf(match[0])+match[0].length+tail.indexOf(anchor[0]);
 if(functionText.slice(0,pos-start).includes('audit.appendRow('))
   throw Error('Audit already written before verification');
 if(!functionText.slice(pos-start).includes("web.getRange(target.row, 6).setValue('承認済み')"))
   throw Error('Unexpected manual-approval behavior; abort');
 const insertion="\n    // v1.9.9: reuse the same five-browser slot count as self-service pairing.\n    assertBrowserSlotsBeforeManualAddV199_(ss, web, r, mioId);";
 const adjusted=source.slice(0,pos)+insertion+source.slice(pos);
 return adjusted.trimEnd()+"\n\n"+guard.trimEnd()+"\n";
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const input=process.argv[2];
 if(!input)throw Error('Provide local original BrowserAddV189Patch.gs file');
 const inputPath=resolve(input);
 const outputPath=join(dirname(inputPath),basename(inputPath,'.gs')+'__V199_REVIEW_ONLY.gs');
 const original=readFileSync(inputPath,'utf8');
 const result=stageBrowserAdd(original);
 writeFileSync(outputPath,result,{flag:'wx'});
 process.stdout.write('REVIEW ONLY output: '+outputPath+'\n');
}
