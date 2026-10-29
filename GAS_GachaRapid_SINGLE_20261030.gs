// 1ファイル版：既存のGASへこのファイルだけを追加。元の2ファイル版と同時に追加しないでください。
// 管理画面のHTMLも内蔵。権限・チェック・回数ロジックは2ファイル版と同じ。
/**
 * MIOガチャ緊急管理 / 2026-10-29
 * 既存のスプレッドシート紐付け Apps Script に追加する独立ファイル。
 * 新規プロジェクト不要。公開 doPost やガチャ抽選機能は変更しない。
 * 初回のみ gachaRapidInstallMenu() を手動実行してメニューを設置。
 *
 * 安全性：2人のGoogle本人確認、Sheet編集権、document lock、
 * 既存MIO-IDの再利用、累計口数（絶対値）、変更前値の照合、
 * 個別承認ログ、抽選履歴の読み取り専用表示。
 */
var GACHA_RAPID_SHEET_ID='1WqkXSV_UehRdpO9VVqRAL9ZTVXwD_GxlH3Ey50uX3PM';
var GACHA_RAPID_EMUJI_EDITOR='rineyuuzi6@gmail.com';

function gachaRapidAdmin_(){
  var email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(!email)throw new Error('Googleアカウントを確認できません。アカウントの権限を確認してください。');
  var file=DriveApp.getFileById(GACHA_RAPID_SHEET_ID);
  var owner=String(file.getOwner().getEmail()||'').trim().toLowerCase();
  var authorized=(email===owner||email===GACHA_RAPID_EMUJI_EDITOR);
  var permitted=email===owner||file.getEditors().some(function(editor){
    return String(editor.getEmail()||'').toLowerCase()===email;
  });
  if(!authorized||!permitted)throw new Error('管理者2人以外には操作権限がありません。');
  return {email:email,role:email===owner?'みお・シートオーナー':'えむじー・編集者'};
}
function gachaRapidInstallMenu(){
  gachaRapidAdmin_();
  var ss=SpreadsheetApp.openById(GACHA_RAPID_SHEET_ID);
  var triggers=ScriptApp.getProjectTriggers();
  if(!triggers.some(function(t){return t.getHandlerFunction()==='gachaRapidAddMenu';})){
    ScriptApp.newTrigger('gachaRapidAddMenu').forSpreadsheet(ss).onOpen().create();
  }
  gachaRapidAddMenu();
  return '緊急ガチャ管理メニューを追加しました。';
}
function gachaRapidAddMenu(){
  SpreadsheetApp.getUi().createMenu('🐳 緊急ガチャ管理')
  .addItem('管理画面を開く','gachaRapidOpen')
  .addToUi();
}
function gachaRapidOpen(){
  gachaRapidAdmin_();
  var html=HtmlService.createHtmlOutput("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><base target=\"_top\"><style>:root{font-family:system-ui,-apple-system,\"Noto Sans JP\",sans-serif;color:#19334f}*{box-sizing:border-box}body{margin:0;background:#edf5fb;padding:16px}.wrap{max-width:1080px;margin:auto}h1{font-size:23px;margin:0}h2{font-size:18px;margin:8px 0}small,.muted{color:#55718b}button,input,select{font:inherit}button,.btn{border:0;border-radius:10px;min-height:42px;padding:9px 14px;background:#195789;color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.outline{background:#fff;border:1px solid #407da8;color:#174b72}.card{background:white;border:1px solid #bcd5e8;border-radius:14px;padding:16px;margin-top:14px;box-shadow:0 4px 18px #1c416110}.row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.tabs button{flex:1;min-width:110px}.tabs .active{background:#0b345c}.status{padding:11px 14px;background:#eff4ff;border-left:4px solid #438cc3;border-radius:8px;white-space:pre-wrap}.error{background:#fff0ee;border-color:#d94f40}.good{background:#e4f8e9;border-color:#368557}.table{overflow:auto;max-height:310px;border:1px solid #d0e1ee;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #e2edf4;white-space:nowrap}th{position:sticky;top:0;background:#e9f4fb;color:#123650}tr[data-pick]{cursor:pointer}tr[data-pick]:hover{background:#eef7ff}input,select{border:1px solid #9fbed6;background:white;padding:10px;border-radius:9px;min-height:44px;min-width:130px}input[type=number]{width:110px;min-width:70px}input[type=checkbox]{min-height:16px;min-width:16px}label{display:block;font-weight:700;margin:8px 0}.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:660px){.two{grid-template-columns:1fr}}.hidden{display:none!important}.chip{padding:4px 9px;border-radius:30px;background:#e5f2fb;color:#315574;font-size:13px;font-weight:700}.warn{color:#9c4c16}</style></head><body><div class=\"wrap\"><header class=\"row\"><div><h1>🐳 ガチャ緊急管理</h1><small>10月30日対応｜Google共有権限・2人限定</small></div><button id=\"reload\" class=\"outline\" type=\"button\">↻ 更新</button><span class=\"chip\" id=\"gate\">受付設定取得中…</span></header>\n<p id=\"status\" role=\"status\" class=\"status\">管理データを読み込み中…</p>\n<nav class=\"row tabs\"><button type=\"button\" data-tab=\"pending\" class=\"active\">① 承認・付与</button><button type=\"button\" data-tab=\"rights\">② 残回数</button><button type=\"button\" data-tab=\"history\">③ 当選結果</button></nav>\n<section id=\"pending\" class=\"panel\">\n <div class=\"card\"><h2>新規・承認待ちの端末</h2><p class=\"muted\">名前を選んで、購入証拠と本人確認後に承認します。ガチャをONにする操作はありません。</p><div class=\"table\"><table><thead><tr><th>名前</th><th>状態</th><th>メンシプ</th><th>紐づけ先</th><th>選択</th></tr></thead><tbody id=\"pendingBody\"></tbody></table></div></div>\n <div class=\"card\"><h2>本人確認・ガチャ口数を確定</h2><p id=\"chosen\" class=\"status\">まず上の一覧から申請を選んでください。</p>\n  <div class=\"two\"><div><label for=\"master\">紐づけ先MIO-ID</label><select id=\"master\"><option value=\"\">申請者を選択してください</option></select></div><div><label for=\"m1\">1ヶ月型・累計口数</label><input id=\"m1\" type=\"number\" min=\"0\" max=\"50\" value=\"0\"><label for=\"m3\">3ヶ月型・累計口数</label><input id=\"m3\" type=\"number\" min=\"0\" max=\"50\" value=\"0\"></div></div>\n  <p class=\"muted\">「追加口数」ではなく<strong>累計口数</strong>を入力。同じ値を再送しても二重付与しない設計です。名前が同じだけでは本人確認になりません。</p>\n  <label><input id=\"verified\" type=\"checkbox\"> メンシプ購入画面・本人を管理者が確認済み</label>\n  <button id=\"approve\" type=\"button\" disabled>🔐 承認・回数を確定</button>\n  <p class=\"warn\">既存の別ID・同名重複・ログインID不一致がある場合は処理せず、元の台帳で確認してください。</p>\n </div></section>\n<section id=\"rights\" class=\"panel hidden\"><div class=\"card\"><h2>参加者別のガチャ残回数</h2><label for=\"rightSearch\">名前・MIO-ID検索</label><input id=\"rightSearch\" placeholder=\"名前または MIO-0000\" type=\"search\"><div class=\"table\"><table><thead><tr><th>名前</th><th>ID</th><th>1ヶ月型</th><th>3ヶ月型</th><th>総権利</th><th>残回数</th><th>確認</th></tr></thead><tbody id=\"rightsBody\"></tbody></table></div></div></section>\n<section id=\"history\" class=\"panel hidden\"><div class=\"card\"><h2>抽選結果（全員・最新順）</h2><label for=\"historySearch\">名前・景品・MIO-ID検索</label><input id=\"historySearch\" type=\"search\" placeholder=\"検索\"><div class=\"table\"><table><thead><tr><th>日時</th><th>名前</th><th>通常／ラキフェス</th><th>当選景品</th><th>ID</th><th>状態</th></tr></thead><tbody id=\"historyBody\"></tbody></table></div></div></section>\n<p class=\"muted\">この画面はGoogle Apps Scriptのダイアログで動作します。管理者権限はサーバー側でも毎回検証し、全員の抽選結果は読み取り専用です。</p></div>\n<script>\n'use strict';\nconst $=id=>document.getElementById(id);let data=null,selected=null,busy=false;\nfunction say(txt,err=false){$('status').textContent=txt;$('status').className='status'+(err?' error':'');}\nfunction node(tag,text){const e=document.createElement(tag);e.textContent=String(text??'');return e;}\nfunction table(body,cols,rows,action){const b=$(body);b.replaceChildren();if(!rows.length){const tr=node('tr','');const td=node('td','該当データがありません');td.colSpan=cols;b.append(tr);tr.append(td);return}for(const r of rows){const tr=document.createElement('tr');for(const s of action? r[0]:r){tr.append(node('td',s))}if(action){tr.dataset.pick='yes';const td=document.createElement('td');const btn=node('button','選択');btn.type='button';btn.className='outline';btn.onclick=()=>action(r[1]);td.append(btn);tr.append(td);tr.addEventListener('click',e=>{if(e.target!==btn)action(r[1])})}b.append(tr)}}\nfunction filteredRows(needle,rows){const q=String(needle||'').trim().toLowerCase();return !q?rows:rows.filter(r=>Object.values(r).some(v=>String(v||'').toLowerCase().includes(q)));}\nfunction showRights(){if(!data)return;const rows=filteredRows($('rightSearch').value,data.rights);table('rightsBody',7,rows.map(r=>[r.name,r.id,r.m1,r.m3,r.total,r.remaining,r.check]));}\nfunction showHistory(){if(!data)return;const rows=filteredRows($('historySearch').value,data.history);table('historyBody',6,rows.map(r=>[r.date.replace('T',' ').slice(0,16),r.name,r.mode,r.prize,r.id,r.result]));}\nfunction selectRegistration(r){\n selected=r;\n const matches=data.rights.filter(x=>x.name===r.name);\n $('chosen').textContent='申請者：'+r.name+'\\n現在：'+r.approval+' ／ '+r.membership+'\\nWeb登録ID：'+r.webId;\n const select=$('master');select.replaceChildren();\n const o=node('option','新しいMIO-IDを発行（既存IDがない人のみ）');o.value='NEW';select.append(o);\n for(const x of data.masters){const op=node('option',x.id+'｜'+x.name);op.value=x.id;select.append(op)}\n if(r.masterId&&data.masters.some(x=>x.id===r.masterId))select.value=r.masterId;\n else if(matches.length===1)select.value=matches[0].id;\n else select.value='NEW';\n updateCount();\n $('verified').checked=false;\n $('approve').disabled=false;\n}\nfunction updateCount(){\n const r=data?.rights?.find(x=>x.id===$('master').value);\n $('m1').value=r?r.m1:0;$('m3').value=r?r.m3:0;\n}\nfunction showPending(){\n if(!data)return;\n const rows=data.registrations.filter(r=>r.approval==='承認待ち'||r.approval==='承認済み'&&r.membership!=='確認済み');\n table('pendingBody',5,rows.map(r=>[[r.name,r.approval,r.membership,r.masterId||'未照合'],r]),selectRegistration);\n}\nasync function load(){\n if(busy)return;busy=true;$('reload').disabled=true;say('管理者と台帳を確認しています…');\n google.script.run.withSuccessHandler(d=>{\n   busy=false;$('reload').disabled=false;\n   if(!d||!d.ok){say('読み込みデータが不正です',true);return}\n   data=d;selected=null;$('approve').disabled=true;\n   $('gate').textContent='通常：'+(d.normalOpen?'ON':'OFF')+' ／ ラキフェス：'+(d.festOpen?'ON':'OFF');\n   say('✅ '+d.actor+' の管理者確認済み。承認待ち・残回数・当選結果を読み込みました。');\n   showPending();showRights();showHistory();\n }).withFailureHandler(e=>{busy=false;$('reload').disabled=false;say('管理者認証・通信に失敗しました：'+(e?.message||'確認不可'),true)}).gachaRapidSnapshot();\n}\n$('reload').onclick=load;\n$('master').onchange=updateCount;\n$('rightSearch').oninput=showRights;$('historySearch').oninput=showHistory;\ndocument.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('hidden',x.id!==b.dataset.tab))});\n$('approve').onclick=()=>{\n if(busy||!data||!selected||!$('verified').checked){say('本人確認チェックを入れてください',true);return}\n const m1=Number($('m1').value),m3=Number($('m3').value);\n const targetId=$('master').value,r=data.rights.find(x=>x.id===targetId);\n if(!targetId||!Number.isSafeInteger(m1)||!Number.isSafeInteger(m3)||m1<0||m3<0){say('MIO-IDと口数を確認してください',true);return}\n if(!confirm(selected.name+' さんを本人確認済みとして承認し、1ヶ月型'+m1+'口・3ヶ月型'+m3+'口（累計）にしますか？'))return;\n busy=true;$('approve').disabled=true;\n google.script.run.withSuccessHandler(result=>{\n  busy=false;say('✅ '+result.name+' さんの承認と累計'+result.rights+'回分の確認が完了しました。ガチャ公開設定は変更していません。');\n  $('verified').checked=false;load();\n }).withFailureHandler(e=>{\n   busy=false;$('approve').disabled=false;\n   say('⚠️ 完了を確認できません：'+(e?.message||'エラー')+'\\n二重付与を防ぐため元台帳を読み直してから操作してください。',true);\n }).gachaRapidApproveAndGrant({webId:selected.webId,name:selected.name,targetId:targetId,m1:m1,m3:m3,expectedM1:r?r.m1:0,expectedM3:r?r.m3:0,verified:true});\n};\nload();\n</script></body></html>").setWidth(1100).setHeight(680);
  SpreadsheetApp.getUi().showModelessDialog(html,'🐳 10/30 ガチャ緊急管理');
}
function gachaRapidNameKey_(value){
  // A weaker visual variation is not proof of a second person. Stop, never auto-link.
  return String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
}
function gachaRapidRows_(sheet,columns,limit){
  if(!sheet)throw new Error('必要な管理タブがありません');
  var count=Math.min(Math.max(0,sheet.getLastRow()-1),limit);
  return count?sheet.getRange(2,1,count,columns).getValues():[];
}
function gachaRapidSnapshot(){
  var actor=gachaRapidAdmin_();
  var ss=SpreadsheetApp.openById(GACHA_RAPID_SHEET_ID);
  var people=gachaRapidRows_(ss.getSheetByName('emuzii_参加者'),2,499);
  var web=gachaRapidRows_(ss.getSheetByName('emuzii_Web登録'),21,499);
  var gacha=gachaRapidRows_(ss.getSheetByName('emuzii_ガチャ'),17,499);
  var draws=gachaRapidRows_(ss.getSheetByName('emuzii_当選履歴'),11,998);
  var admin=ss.getSheetByName('emuzii_管理画面');
  var masters=people.filter(function(p){return /^MIO-\d{4}$/.test(String(p[0]||''))&&p[1];}).map(function(p){return {id:p[0],name:String(p[1])};});
  var rights=gacha.filter(function(r){return /^MIO-\d{4}$/.test(String(r[0]||''))&&r[1];}).map(function(r){
    return {id:String(r[0]),name:String(r[1]),m1:Number(r[2])||0,m3:Number(r[3])||0,total:Number(r[5])||0,remaining:Number(r[7])||0,check:String(r[12])};
  });
  var registrations=web.filter(function(r){return /^MIO-W-[a-f0-9]{24}$/.test(String(r[0]||''));}).map(function(r){
    return {webId:String(r[0]),name:String(r[2]||''),approval:String(r[5]||''),membership:String(r[6]||''),masterId:String(r[7]||''),identity:String(r[11]||''),device:String(r[13]||'')};
  });
  // Token hash (Web B列) を絶対に返さない。
  var history=draws.filter(function(r){return r[0]&&r[2];}).map(function(r){
    var date=r[8] instanceof Date?r[8].toISOString():String(r[8]||'');
    return {name:String(r[3]||''),id:String(r[2]),mode:String(r[4]||''),prize:String(r[6]||''),date:date,result:String(r[10]||'')};
  });
  history.sort(function(a,b){return b.date.localeCompare(a.date);});
  var normal=admin.getRange('B141').getValue()===true,fest=admin.getRange('B142').getValue()===true;
  return {ok:true,actor:actor.role,normalOpen:normal,festOpen:fest,masters:masters,registrations:registrations,rights:rights,history:history.slice(0,450)};
}
function gachaRapidApproveAndGrant(req){
  var actor=gachaRapidAdmin_();
  if(!req||req.verified!==true)throw new Error('管理者の本人確認チェックが必要です');
  var webId=String(req.webId||''),targetId=String(req.targetId||''),expectedName=String(req.name||'');
  if(!/^MIO-W-[a-f0-9]{24}$/.test(webId)||!expectedName||expectedName.length>40)throw new Error('登録申請を選択してください');
  if(!(targetId==='NEW'||/^MIO-\d{4}$/.test(targetId)))throw new Error('MIO-IDを選び直してください');
  var m1=Number(req.m1),m3=Number(req.m3),old1=Number(req.expectedM1),old3=Number(req.expectedM3);
  if(![m1,m3,old1,old3].every(function(n){return Number.isSafeInteger(n)&&n>=0&&n<=50;}))throw new Error('口数は0〜50の整数で入力してください');
  if(m1+3*m3<1||m1+3*m3>100)throw new Error('口数が不正です');
  if(m1<old1||m3<old3)throw new Error('付与数の減少は、この画面ではできません');
  var lock=LockService.getDocumentLock()||LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error('別の管理者が操作中です。読み直してください');
  try{
    var ss=SpreadsheetApp.openById(GACHA_RAPID_SHEET_ID);
    var web=ss.getSheetByName('emuzii_Web登録'),people=ss.getSheetByName('emuzii_参加者'),gacha=ss.getSheetByName('emuzii_ガチャ');
    if(!web||!people||!gacha)throw new Error('登録・ガチャ台帳の連携を確認できません');
    var webs=gachaRapidRows_(web,21,499),found=[];
    webs.forEach(function(w,i){if(w[0]===webId)found.push({row:i+2,data:w});});
    if(found.length!==1)throw new Error('Web登録IDが不明または重複しています');
    var wd=found[0].data,webRow=found[0].row,name=String(wd[2]||'');
    // Stop placeholder Web IDs posing as ColorSing names: these rows are recovery candidates, not verified people.
    if(/^MIO-(?:W-|\d{4}$)/i.test(name)||!String(wd[1]||'').match(/^[a-f0-9]{64}$/i))throw new Error('ColorSing名または端末認証の登録を確認できません。本人確認してください');
    if(name!==expectedName)throw new Error('登録名が変更されています。再読み込みしてください');
    if(!/^[^=+@-][^\x00-\x1f]{0,39}$/.test(name))throw new Error('登録名の記号を管理者が確認してください');
    if(wd[5]!=='承認待ち'&&wd[5]!=='承認済み')throw new Error('登録状態を確認してください');
    if(String(wd[16]||'')==='旧端末'||String(wd[13]||'').indexOf('旧端末')>=0)throw new Error('旧端末の登録です。端末切替承認を別途確認してください');
    if(wd[5]==='承認済み'&&String(wd[7]||'')!==targetId)throw new Error('承認済みの参加者IDを変更できません');
    var rows=gachaRapidRows_(people,2,499),same=rows.map(function(r,i){return {row:i+2,id:r[0],name:r[1]};}).filter(function(x){return x.name===name;});
    if(same.length>1)throw new Error('同名参加者が複数います。本人照合後に元台帳で整理してください');
    var targetRow,master;
    if(targetId==='NEW'){
      if(rows.some(function(r){return r[1]&&gachaRapidNameKey_(r[1])===gachaRapidNameKey_(name);}))
        throw new Error('同名・類似名の既存MIO-ID候補があります。新規発行せず本人確認してください');
      if(wd[7]||(wd[10]&&wd[10]!==webId))throw new Error('既存のMIO-ID候補があり、新規作成できません');
      for(var i=0;i<rows.length;i++){if(!rows[i][1]){targetRow=i+2;break;}}
      if(!targetRow)throw new Error('参加者台帳に空行がありません');
      var idCell=people.getRange(targetRow,1),gachaId=gacha.getRange(targetRow,1);
      if(!idCell.getFormula()||!gachaId.getFormula())throw new Error('新規ID用の連携式がありません');
      master='MIO-'+('0000'+(targetRow-1)).slice(-4);
      var idValues=rows.filter(function(r){return r[0]===master;});
      if(idValues.length)throw new Error('MIO-ID重複の可能性があります');
    }else{
      master=targetId;
      var match=rows.map(function(r,i){return {row:i+2,id:r[0],name:r[1]};}).filter(function(x){return x.id===master&&x.name===name;});
      if(match.length!==1)throw new Error('登録名とMIO-IDが一致しません。管理者照合が必要です');
      targetRow=match[0].row;
      if(wd[7]&&wd[7]!==master)throw new Error('Web登録に別のMIO-IDが設定されています');
      if(wd[10]&&wd[10]!==master&&!(wd[5]==='承認待ち'&&wd[10]===webId))throw new Error('Web統合IDが一致しません');
    }
    var g=gacha.getRange(targetRow,1,1,17).getValues()[0];
    if(targetId==='NEW'){
      // A blank nickname is not proof that the destination is unused. Preserve orphaned data.
      var leftover=people.getRange(targetRow,3,1,7).getValues()[0];
      if(leftover.some(function(v){return v!==''&&v!==null&&v!==undefined;}))
        throw new Error('新規参加者行に過去の記録があります。上書きせず確認してください');
      var controlled=[2,3,4,6,9,14,15]; // C/D/E, G, J, O/P: purchased, used and bonus rights
      if(g[0]||g[1]||controlled.some(function(i){return g[i]!==''&&g[i]!==null&&g[i]!==undefined&&Number(g[i])!==0;}))
        throw new Error('新規作成先のガチャ行に既存の回数・履歴があります');
    }
    if(targetId!=='NEW'&&(g[0]!==master||g[1]!==name))throw new Error('ガチャ台帳のIDまたは名前が一致しません');
    if(Number(g[2])!==old1||Number(g[3])!==old3)throw new Error('別の管理者が口数を変更しました。再読み込みしてください');
    if(m1<Number(g[2])||m3<Number(g[3]))throw new Error('既存の口数は減らせません');
    if(webs.some(function(w){return w[0]!==webId&&gachaRapidNameKey_(w[2])===gachaRapidNameKey_(name)&&w[5]==='承認済み'&&w[7]&&w[7]!==master;}))throw new Error('同名・類似名の別IDが承認済みです。本人確認をやり直してください');
    // All safety checks complete. Keep prizes, draws, participation and check-in data untouched.
    if(targetId==='NEW'){
      people.getRange(targetRow,2).setValue(name);
      SpreadsheetApp.flush();
      if(String(people.getRange(targetRow,1).getDisplayValue())!==master||String(gacha.getRange(targetRow,2).getDisplayValue())!==name)
        throw new Error('参加者ID作成後の連携に失敗しました。操作を繰り返さず管理者に確認してください');
    }
    // Absolute cumulative counts make identical resubmissions idempotent.
    if(m1!==old1)gacha.getRange(targetRow,3).setValue(m1);
    if(m3!==old3)gacha.getRange(targetRow,4).setValue(m3);
    web.getRange(webRow,8).setValue(master); // H: participant ID
    web.getRange(webRow,11).setValue(master); // K: unified participant ID
    web.getRange(webRow,12).setValue('確認済み');
    web.getRange(webRow,13).setValue(new Date());
    web.getRange(webRow,7).setValue('確認済み'); // G: membership confirmed
    if(String(wd[16]||'')!=='使用中')web.getRange(webRow,17).setValue('使用中'); // Q: verified active browser
    web.getRange(webRow,6).setValue('承認済み'); // F: approval
    SpreadsheetApp.flush();
    var a=web.getRange(webRow,1,1,20).getDisplayValues()[0];
    var b=gacha.getRange(targetRow,1,1,14).getDisplayValues()[0];
    if(a[5]!=='承認済み'||a[6]!=='確認済み'||a[7]!==master||a[10]!==master||a[11]!=='確認済み'||
       b[0]!==master||b[1]!==name||Number(b[2])!==m1||Number(b[3])!==m3||b[12]!=='OK'||b[13]!=='OK')
      throw new Error('一部反映が未完了です。二重に付与せず台帳を確認してください');
    var audit=ss.getSheetByName('emuzii_ガチャ緊急操作履歴');
    if(!audit){audit=ss.insertSheet('emuzii_ガチャ緊急操作履歴');audit.getRange(1,1,1,9).setValues([['日時','管理者','Web登録ID','参加者ID','ColorSing名','1ヶ月型(最終累計)','3ヶ月型(最終累計)','新規ID','操作']]);audit.setFrozenRows(1);}
    audit.appendRow([new Date(),actor.email,webId,master,name,m1,m3,targetId==='NEW'?'はい':'いいえ','本人確認・承認・累計口数確認']);
    return {ok:true,name:name,masterId:master,m1:m1,m3:m3,rights:m1+3*m3,openChanged:false};
  }finally{lock.releaseLock();}
}