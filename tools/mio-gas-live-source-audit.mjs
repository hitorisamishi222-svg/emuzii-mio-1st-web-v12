// Offline, read-only verification. Never writes GAS source, environment variables, or Sheets.
// Usage: node tools/mio-gas-live-source-audit.mjs <local-production-Code.gs> [other local *.gs ...]
// Never place production source or secrets in a Git commit or chat.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const functionNames = s => [...s.matchAll(/^\s*function\s+([\w$]+)\s*\(/gm)].map(x=>x[1]);
function fnBody(s,name){
 const m=[...s.matchAll(/^\s*function\s+([\w$]+)\s*\(/gm)];
 const i=m.findIndex(x=>x[1]===name);
 if(i<0)return '';
 return s.slice(m[i].index,i+1<m.length?m[i+1].index:s.length);
}
export function auditGas(sourceFiles,expectedModule){
 const report={status:'STOP',doPostCount:0,expectedOpsCount:0,presentOpsCount:0,
  duplicates:[],missingOps:[],issues:[],canSafelyPatch:false};
 if(!Array.isArray(sourceFiles)||sourceFiles.length===0||sourceFiles.some(s=>typeof s!=='string'||!s.trim())){
  report.issues.push('稼働中の全GASファイルが未取得');return report;
 }
 const expected=functionNames(expectedModule);
 if(expected.length!==19||new Set(expected).size!==expected.length){
  report.issues.push('候補19関数の定義が不正');return report;
 }
 const names=sourceFiles.flatMap(functionNames);
 const counts=new Map();
 for(const n of names)counts.set(n,(counts.get(n)||0)+1);
 report.duplicates=[...counts].filter(([,n])=>n>1).map(([n])=>n).sort();
 report.doPostCount=counts.get('doPost')||0;
 report.expectedOpsCount=expected.length;
 report.presentOpsCount=expected.filter(n=>counts.has(n)).length;
 report.missingOps=expected.filter(n=>!counts.has(n));
 if(report.doPostCount!==1)report.issues.push('doPostが1つではない');
 if(report.duplicates.length)report.issues.push('重複関数あり（統合候補と単独19関数を両方追加しないこと）');
 const owner=sourceFiles.filter(s=>functionNames(s).includes('doPost'));
 const action=owner.length===1?fnBody(owner[0],'doPost'):'';
 const lock=action.indexOf('LockService.getScriptLock()');
 const secret=action.indexOf('equal_(d.secret,secret)');
 const identity=action.indexOf('d.participantId');
 const dispatch=action.search(/if\s*\(\s*\/\^webAdminOps\(/);
 const functionCall=action.indexOf('mioAdminOps_(');
 const validSharedAuth=lock>=0&&secret>lock&&action.includes('BRIDGE_SECRET');
 if(!validSharedAuth)report.issues.push('既存のLockServiceまたは共有秘密鍵検証の順序が未確認');
 if(identity<0)report.issues.push('参加者ID形式検査を識別できない');
 if(dispatch>=0&&(functionCall<dispatch||dispatch<=secret||dispatch>=identity))
  report.issues.push('管理命令分岐の順序が不正');
 if(report.issues.length)return report;
 if(dispatch>=0&&report.presentOpsCount===expected.length){
  report.status='READ_ONLY_CONNECTION_TEST_NEXT';
  return report;
 }
 if(dispatch<0&&report.presentOpsCount===0){
  report.status='MINIMAL_PATCH_CAN_BE_REVIEWED';
  report.canSafelyPatch=true;
  report.issues.push('公開前に現行全ソースのバックアップと、実デプロイのバージョン照合が必須');
  return report;
 }
 report.issues.push('管理分岐または管理関数が一部のみ存在する。自動補完や全文置換は禁止');
 return report;
}
function main(){
 const files=process.argv.slice(2);
 if(files.length===0){process.stderr.write('Usage: node tools/mio-gas-live-source-audit.mjs current-Code.gs [other-GAS-files.gs ...]\\n');process.exitCode=2;return;}
 const sources=files.map(f=>readFileSync(f,'utf8'));
 const module=readFileSync(new URL('../GAS_WebAdminOps_20261030.gs',import.meta.url),'utf8');
 const report=auditGas(sources,module);
 // Report only counts and names; never print any source, credentials, participant rows or contents.
 process.stdout.write(JSON.stringify(report,null,2)+'\\n');
 if(report.status==='STOP')process.exitCode=1;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main();
