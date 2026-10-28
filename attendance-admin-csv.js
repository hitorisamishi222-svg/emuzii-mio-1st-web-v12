// vNext: CSV inspection only. Never sends, stores, or changes participant data.
const ID=/^MIO-[0-9]{4,}$/;
export function parseCsv(input){
 if(typeof input!=='string')throw new TypeError('CSV text required');
 if(input.length>2_000_000)throw new Error('CSV_TOO_LARGE');
 const text=input.replace(/^\uFEFF/,'');
 const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){
   if(ch==='"'){
    if(text[i+1]==='"'){cell+='"';i++;}
    else {quoted=false;afterQuote=true;}
   }else cell+=ch;
  }else if(afterQuote){
   if(ch===','){row.push(cell);cell='';afterQuote=false;}
   else if(ch==='\n'||ch==='\r'){row.push(cell);rows.push(row);row=[];cell='';afterQuote=false;if(ch==='\r'&&text[i+1]==='\n')i++;}
   else if(ch!==' '&&ch!=='\t')throw new Error('CSV_AFTER_QUOTE_INVALID');
  }else if(ch==='"'&&cell==='')quoted=true;
  else if(ch===','){row.push(cell);cell='';}
  else if(ch==='\n'||ch==='\r'){row.push(cell);rows.push(row);row=[];cell='';if(ch==='\r'&&text[i+1]==='\n')i++;}
  else if(ch==='"')throw new Error('CSV_QUOTE_INVALID');
  else cell+=ch;
 }
 if(quoted)throw new Error('CSV_UNCLOSED_QUOTE');
 if(row.length||cell!==''||afterQuote){row.push(cell);rows.push(row);}
 return rows.filter(r=>r.some(v=>v.trim()!==''));
}
export function inspectAttendanceCsv(input){
 const rows=parseCsv(input);
 if(!rows.length)throw new Error('CSV_EMPTY');
 if(rows.length>5001)throw new Error('CSV_TOO_MANY_ROWS');
 const items=[],warnings=[];const seen=new Map();
 let dataSeen=false;
 for(let i=0;i<rows.length;i++){
  const r=rows[i],id=String(r[0]||'').trim(),name=String(r[1]||'').trim();
  // Allow one leading header row; never invent participant identities.
  if(i===0&&!ID.test(id)){continue;}
  if(!ID.test(id)){
   warnings.push(`${i+1}行: MIO-IDの形式を確認してください`);continue;
  }
  dataSeen=true;
  if(r.length<34){warnings.push(`${i+1}行: 34列（A〜AH）未満です`);continue;}
  const confirmedDays=[],unknownDays=[];
  for(let d=1;d<=31;d++){
   const mark=String(r[d+1]??'').trim();
   if(mark==='○')confirmedDays.push(d);
   else if(mark!=='')unknownDays.push(d);
  }
  const rawTotal=String(r[33]??'').trim();
  const total=/^\d+$/.test(rawTotal)?Number(rawTotal):null;
  const issues=[];
  if(!name)issues.push('名前が空欄');
  if(total===null)issues.push('集計列AHが空欄または数値以外');
  else if(total!==confirmedDays.length)issues.push('AH集計と確認済み日数に差があります');
  if(unknownDays.length)issues.push('○以外の記録があります');
  if(seen.has(id)){
   issues.push('MIO-IDが重複');
   const prior=items[seen.get(id)];if(!prior.issues.includes('MIO-IDが重複'))prior.issues.push('MIO-IDが重複');
  }else seen.set(id,items.length);
  items.push({id,name,confirmedDays,reportedTotal:total,unknownDays,issues,sourceRow:i+1});
 }
 if(!dataSeen)throw new Error('CSV_NO_MIO_ID');
 return {items,warnings};
}
