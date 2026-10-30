'use strict';
const $=id=>document.getElementById(id),demo=new URL(location.href).searchParams.get('demo')==='1';
let key='',cache=null,grant=null,busy=false;
const sample={ok:true,pendingCount:1,intakePending:1,
pending:[{webId:'MIO-W-0123456789abcdef01234567',name:'テスト参加者A',status:'承認待ち',masterId:'MIO-0001',memberStatus:'未確認'}],
people:[{masterId:'MIO-0001',name:'テスト参加者A'},{masterId:'MIO-0002',name:'テスト参加者B'}],
gacha:[{masterId:'MIO-0001',name:'テスト参加者A',total:3,remaining:2,bonus:0,check:'OK',nameCheck:'OK'}],
intake:[{row:2,name:'テスト初訪問者',state:'管理確認待ち',note:'デモ用の架空データ'}]};
const say=(t,bad=false)=>{const x=$('status');x.textContent=t;x.className='notice'+(bad?' err':' ok')};
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n};
const clear=n=>n.replaceChildren();
const option=(value,label)=>{let o=node('option',label);o.value=value;return o};
const opId=()=>crypto.randomUUID().replace(/-/g,'');
function fake(action,params){
 if(action==='overview'||action==='pending'||action==='intakeList')return Promise.resolve(sample);
 if(action==='detail')return Promise.resolve({ok:true,subject:{...sample.gacha[0],hasApprovedBrowser:true}});
 if(action==='grantHistory')return Promise.resolve({ok:true,history:[]});
 return Promise.resolve({ok:true,message:'デモ操作です。実際のシートは変更していません。'});
}
async function request(action,details={}){
 if(demo)return fake(action,details);
 const r=await fetch('/api/mio-ops',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',
 body:JSON.stringify({action,code:key,...details})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||d.ok!==true)throw Error(d.error||'管理台帳に接続できません');
 return d;
}
function openTab(id){
 document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!==id);
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===id)));
 if(id==='history'&&cache)history();
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));
function render(){
 $('numPending').textContent=cache.pendingCount||0;$('numIntake').textContent=cache.intakePending||0;
 const list=$('pendingList');clear(list);
 for(const item of cache.pending||[]){
  const box=node('div');box.className='item';
  const title=node('b',item.name),meta=node('p',item.webId+' / '+item.status+' / '+(item.masterId||'ID未照合'));meta.className='small';
  const select=node('select');select.append(option('','照合するMIO-IDを選択'));
  for(const p of cache.people||[])select.append(option(p.masterId,p.masterId+' / '+p.name));
  select.value=item.masterId||'';
  const label=node('label','メンシプ本人確認完了');label.className='small';
  const check=node('input');check.type='checkbox';check.style.width='24px';check.style.minHeight='24px';label.prepend(check);
  const confirmBtn=node('button','本人確認して承認');
  confirmBtn.onclick=()=>write('approve',{subjectId:item.webId,masterId:select.value,memberConfirmed:check.checked},'承認');
  box.append(title,meta,select,label,confirmBtn);list.append(box);
 }
 if(!list.children.length)list.append(node('p','承認待ちはありません。'));
 const persons=$('person');clear(persons);persons.append(option('','参加者を選択'));
 for(const p of cache.gacha||[])persons.append(option(p.masterId,p.masterId+' / '+p.name));
 grant=null;$('bonus').textContent='―';$('remaining').textContent='―';$('grantButton').disabled=true;
 const intakes=$('intakes');clear(intakes);
 for(const entry of cache.intake||[]){
  const box=node('div');box.className='item';box.append(node('b',entry.name),node('p','状態：'+entry.state+(entry.note?' / '+entry.note:'')));
  if(entry.state!=='確認済み'){const b=node('button','受付を確認済みにする');b.onclick=()=>write('intakeMark',{row:entry.row,state:'確認済み'},'受付確認');box.append(b)}
  intakes.append(box);
 }
 if(!intakes.children.length)intakes.append(node('p','受付データはありません。'));
}
async function load(){cache=await request('overview');render();say('✅ 管理台帳を読み込みました。')};
async function login(){
 if(busy)return;key=$('code').value;$('code').value='';
 if(!demo&&key.length<24)return say('管理者コードを入力してください。',true);
 busy=true;
 try{await load()}catch(e){cache=null;key='';say(e.message,true)}finally{busy=false}
}
$('login').onclick=login;
$('person').onchange=async()=>{
 grant=null;$('bonus').textContent='―';$('remaining').textContent='―';$('grantButton').disabled=true;
 const id=$('person').value;if(!id)return;
 try{
 const d=await request('detail',{subjectId:id});grant=d.subject;
 $('bonus').textContent=grant.bonus;$('remaining').textContent=grant.remaining;
 $('grantButton').disabled=!(grant.hasApprovedBrowser&&grant.check==='OK'&&grant.nameCheck==='OK');
 if(!grant.hasApprovedBrowser)say('先にWeb登録承認が必要です。',true);
 }catch(e){say(e.message,true)}
};
$('grantButton').onclick=()=>{
 if(!grant)return;
 const amount=Number($('amount').value),reason=$('reason').value.trim();
 if(!Number.isSafeInteger(amount)||amount<1||amount>30||reason.length<2)return say('回数・理由を確認してください。',true);
 write('grant',{subjectId:grant.masterId,amount,reason,expectedBonus:grant.bonus},'回数付与');
};
$('intakeButton').onclick=()=>{
 const name=$('newName').value.trim(),note=$('newNote').value.trim();
 if(!name||name.length>40)return say('名前を確認してください。',true);
 write('intakeCreate',{name,note},'初訪問受付');
};
async function write(action,details,caption){
 if(busy)return;
 if(!details.masterId&&action==='approve')return say('本人のMIO-IDを指定してください。',true);
 if(!confirm(caption+'を実行しますか？ 対象・回数を確認してください。'))return;
 busy=true;
 try{
  const result=await request(action,{...details,requestId:opId()});
  say('✅ '+(result.message||caption+'を保存しました'));
  if(!demo)await load();
 }catch(e){say('⚠️ '+e.message+'。再実行する前に現在の状態を確認してください。',true)}
 finally{busy=false}
}
async function history(){
 try{
 const h=await request('grantHistory');const list=$('historyList');clear(list);
 for(const r of h.history||[]){let div=node('div');div.className='item';div.append(node('b',r.masterId+' '+r.name+'　+'+r.amount+'回'),node('p',r.reason+' / 特別付与'+r.before+'→'+r.after));list.append(div)}
 if(!list.children.length)list.append(node('p','履歴はありません。'));
 }catch(e){say(e.message,true)}
}
$('historyRefresh').onclick=history;
if(demo){
 const banner=node('div','デモ表示：名前・数値は架空です。シートには保存されません。');
 banner.className='notice';document.querySelector('main').prepend(banner);
 key='demo';load();
}
