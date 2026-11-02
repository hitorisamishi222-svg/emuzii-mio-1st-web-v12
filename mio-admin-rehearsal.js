'use strict';
// ISOLATED rehearsal. No fetch, storage, cookies, identity, production APIs or writes.
(function(){
 const $=id=>document.getElementById(id);
 const initial=()=>({
  pending:[{id:'REQ-DEMO-1',name:'デモ申請者A'},{id:'REQ-DEMO-2',name:'デモ申請者B'}],
  roster:[{id:'DEMO-01',name:'デモ参加者',tickets:3}],
  incidents:[{id:'INC-DEMO-1',kind:'結果照合',state:'unhandled'},
   {id:'INC-DEMO-2',kind:'端末切替の確認',state:'working'}],
  ops:new Map(),log:[],selected:null,nextMember:2,unconfirmed:null
 });
 let s=initial();
 const make=(tag,content,cls)=>{
  const n=document.createElement(tag);
  if(content!==undefined)n.textContent=String(content);
  if(cls)n.className=cls;
  return n;
 };
 const setMessage=(m)=>{$('demoMessage').textContent=m};
 const audit=what=>{
  s.log.unshift('操作 '+(s.log.length+1)+'：'+what);
  if(s.log.length>150)s.log.length=150;
 };
 function render(){
  $('demoPendingCount').textContent=s.pending.length;
  $('demoIncidentCount').textContent=s.incidents.filter(x=>x.state==='unhandled').length;
  $('demoAuditCount').textContent=s.log.length;
  const pending=$('demoPending');pending.replaceChildren();
  for(const person of s.pending){
   const row=make('div',undefined,'entry');
   row.append(make('strong',person.name),make('p',person.id,'mini'));
   const buttons=make('div',undefined,'actions');
   for(const [action,label] of [['approve','模擬承認'],['reject','模擬却下']]){
    const btn=make('button',label,action==='reject'?'secondary':null);
    btn.type='button';
    btn.addEventListener('click',()=>processRequest(person.id,action));
    buttons.append(btn);
   }
   row.append(buttons);pending.append(row);
  }
  if(!s.pending.length)pending.append(make('p','承認待ちはありません（架空データ）。'));
  const roster=$('demoRoster');roster.replaceChildren();
  const needle=$('demoSearch').value.trim().toLocaleLowerCase('ja');
  const matching=s.roster.filter(p=>(p.id+' '+p.name).toLocaleLowerCase('ja').includes(needle));
  for(const member of matching){
   const row=make('div',undefined,'entry');
   const btn=make('button','この参加者を選ぶ', 'secondary');
   btn.type='button';btn.setAttribute('aria-pressed',String(member.id===s.selected));
   btn.addEventListener('click',()=>{s.selected=member.id;setMessage(member.name+'を選択しました（架空データ）。');render()});
   row.append(make('strong',member.name),make('p',member.id+' ・ 残数 '+member.tickets+'回','mini'),btn);
   roster.append(row);
  }
  if(!matching.length)roster.append(make('p','一致する架空の参加者はいません。'));
  $('demoGrant').disabled=!s.roster.some(x=>x.id===s.selected);
  $('demoVerify').disabled=!s.unconfirmed;
  $('demoUnknown').textContent=s.unconfirmed?
   '応答が失われた模擬操作：'+s.unconfirmed.op+'。新しい付与より先に同じIDで再照合してください。':
   '結果不明の模擬操作はありません。';
  const incidents=$('demoIncidents');incidents.replaceChildren();
  const labels={unhandled:'未対応',working:'対応中',resolved:'解決済み'};
  for(const incident of s.incidents){
   const row=make('div',undefined,'entry');
   row.append(make('strong',incident.kind),make('p',incident.id+' ・ '+labels[incident.state],'mini'));
   if(incident.state!=='resolved'){
    const button=make('button',incident.state==='unhandled'?'対応を開始':'解決済みにする');
    button.type='button';
    button.addEventListener('click',()=>moveIncident(incident.id));
    row.append(button);
   }
   incidents.append(row);
  }
  const log=$('demoAudit');log.replaceChildren();
  for(const line of s.log)log.append(make('li',line));
  if(!s.log.length)log.append(make('li','まだ模擬操作はありません。'));
 }
 function processRequest(id,action){
  const i=s.pending.findIndex(x=>x.id===id);
  if(i<0){setMessage('処理済み申請は再実行できません。');return}
  const [person]=s.pending.splice(i,1);
  if(action==='approve'){
   const memberId='DEMO-'+String(s.nextMember++).padStart(2,'0');
   s.roster.push({id:memberId,name:person.name,tickets:0});
  }
  audit(person.id+'：'+(action==='approve'?'承認':'却下'));
  setMessage(person.name+'を模擬'+(action==='approve'?'承認':'却下')+'しました。実データに変更はありません。');
  render();
 }
 function moveIncident(id){
  const item=s.incidents.find(x=>x.id===id);
  if(!item||item.state==='resolved'){setMessage('操作できない障害状態です。');return}
  const after=item.state==='unhandled'?'working':'resolved';
  audit(item.id+'：'+item.state+' → '+after);
  item.state=after;
  setMessage(item.kind+'の状態を変更しました（架空データ）。');
  render();
 }
 function grant(){
  const member=s.roster.find(x=>x.id===s.selected);
  if(!member){setMessage('模擬参加者を選択してください。');return}
  const raw=$('demoGrantAmount').value;
  const amount=Number(raw);
  if(!/^\d{1,2}$/.test(raw)||!Number.isSafeInteger(amount)||amount<1||amount>50){
   setMessage('付与回数は1〜50の整数にしてください。');return
  }
  const op=$('demoOperationId').value.trim();
  if(!/^DEMO-[A-Z0-9-]{4,35}$/.test(op)){
   setMessage('操作IDは「DEMO-」で始まる英数字とハイフンで指定してください。');return
  }
  const payload=member.id+':'+amount;
  if(s.unconfirmed&&s.unconfirmed.op!==op){
   setMessage('結果不明の操作が残っています。先に同じ操作IDで再照合してください。');return
  }
  if(s.ops.has(op)){
   if(s.ops.get(op)!==payload)setMessage('操作IDが別の内容で再利用されました。付与は拒否しました。');
   else{
    if(s.unconfirmed?.op===op)s.unconfirmed=null;
    setMessage('同じ操作IDの再送を確認しました。二重付与はしていません。');
   }
   render();return
  }
  s.ops.set(op,payload);
  member.tickets+=amount;
  audit(member.id+'：'+amount+'回模擬付与（'+op+'）');
  if($('demoDropReply').checked){
   $('demoDropReply').checked=false;
   s.unconfirmed={op,memberId:member.id,amount,payload};
   setMessage('応答途絶を再現：処理は1回済みですが結果が不明です。新しい付与はせず再照合してください。');
  }else setMessage(member.name+'へ'+amount+'回模擬付与しました。実際のガチャ回数には反映しません。');
  render();
 }
 $('demoSearch').addEventListener('input',render);
 $('demoGrant').addEventListener('click',grant);
 $('demoVerify').addEventListener('click',()=>{
  const pending=s.unconfirmed;
  if(!pending){setMessage('結果不明の模擬操作はありません。');return}
  if(s.ops.get(pending.op)!==pending.payload){
   setMessage('保存済み操作と照合できません。新しい付与はしないでください。');return
  }
  s.unconfirmed=null;
  setMessage('操作ID '+pending.op+' の既存結果を照合しました。'+pending.amount+'回の付与は1回だけで、再付与していません。');
  render();
 });
 $('demoReset').addEventListener('click',()=>{
  s=initial();$('demoSearch').value='';$('demoGrantAmount').value='1';
  $('demoOperationId').value='DEMO-OP-001';$('demoDropReply').checked=false;
  setMessage('リハーサルを初期状態へ戻しました。実データは変更していません。');
  render();
 });
 render();
})();
