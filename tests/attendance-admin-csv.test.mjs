import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,inspectAttendanceCsv} from '../attendance-admin-csv.js';
const row=(id,name,days=[],total=days.length)=>{
 const r=Array(34).fill('');
 r[0]=id;r[1]=name;for(const day of days)r[day+1]='○';r[33]=String(total);
 return r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',');
};
test('quoted commas, escaped quotes and CRLF are parsed',()=>{
 assert.deepEqual(parseCsv('id,name\r\n"MIO-0003","甲,""乙"""'),[['id','name'],['MIO-0003','甲,"乙"']]);
});
test('31 days map C through AG and total is AH',()=>{
 const data=inspectAttendanceCsv('ID,名前\n'+row('MIO-0003','翠央',[1,10,31]));
 assert.equal(data.items[0].id,'MIO-0003');
 assert.deepEqual(data.items[0].confirmedDays,[1,10,31]);
 assert.deepEqual(data.items[0].issues,[]);
});
test('total mismatch and duplicate ID are flagged without modifying data',()=>{
 const data=inspectAttendanceCsv([row('MIO-0003','一',[2],2),row('MIO-0003','二',[3],1)].join('\n'));
 assert.ok(data.items[0].issues.includes('MIO-IDが重複'));
 assert.ok(data.items[0].issues.includes('AH集計と確認済み日数に差があります'));
});
test('unexpected symbols are not counted as check-in',()=>{
 const r=Array(34).fill('');r[0]='MIO-0005';r[1]='A';r[2]='◯';r[33]='0';
 const d=inspectAttendanceCsv(r.join(',')).items[0];
 assert.deepEqual(d.confirmedDays,[]);
 assert.deepEqual(d.unknownDays,[1]);
});
test('malformed CSV is rejected safely',()=>{
 assert.throws(()=>parseCsv('"unclosed'),/CSV_UNCLOSED_QUOTE/);
 assert.throws(()=>inspectAttendanceCsv('Name,Title\nfoo,bar'),/CSV_NO_MIO_ID/);
});
