'use strict';
// ISOLATED rehearsal. No fetch, storage, cookies, identity, production APIs or writes.
(function(){
 const $=id=>document.getElementById(id);
 const initial=()=>({
  pending:[{id:'REQ-DEMO-1',name:'デモ申請者A'},{id:'REQ-DEMO-2',name:'デモ申請者B'}],
  roster:[{id:'DEMO-01',name:'デモ参加者',tickets:3}],
  incidents:[{id:'INC-DEMO-1',kind:'結果照合',state:'unhandled'},
   {id:'INC-DEMO-2',kind:'端末切替の確認',state:'working'}],
  gallery:[
   {id:'ART-DEMO-1',title:'架空作品A・歌の記憶',category:'音楽',visible:true,featured:true,reviewed:true,archived:false,imageUrl:null},
   {id:'ART-DEMO-2',title:'架空作品B・思い出の絵',category:'イラスト',visible:true,featured:false,reviewed:true,archived:false,imageUrl:null},
   {id:'ART-DEMO-3',title:'架空作品C・準備中',category:'写真',visible:false,featured:false,reviewed:true,archived:false,imageUrl:null}
  ],
  ops:new Map(),log:[],selected:null,nextMember:2,nextExhibit:4,unconfirmed:null
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
 // This curator is a browser-memory-only interaction rehearsal with fictional
 // works. No upload, network, storage, publication, permissions or live gallery data.
 const releaseGalleryImages=gallery=>{
  for(const item of gallery)if(item.imageUrl){
   URL.revokeObjectURL(item.imageUrl);
   item.imageUrl=null;
  }
 };
 const galleryThumb=item=>{
  const thumb=make('div',undefined,'gallery-thumb');
  if(item.imageUrl){
   const img=make('img');img.src=item.imageUrl;img.alt='選択した端末内の仮画像';
   thumb.append(img);
  }else thumb.append(make('span','💎'));
  return thumb;
 };
 function renderGallery(){
  const editor=$('demoGallery'),preview=$('demoGalleryPreview');
  editor.replaceChildren();preview.replaceChildren();
  const button=(label,action,disabled=false,cls='secondary')=>{
   const el=make('button',label,cls);el.type='button';el.disabled=disabled;
   if(!disabled)el.addEventListener('click',action);
   return el;
  };
  s.gallery.forEach((item,index)=>{
   const row=make('div',undefined,'entry gallery-row');
   const details=make('div');
   details.append(make('strong',item.title),
    make('p',item.category+' ・ '+(item.archived?'保管済み':item.visible?'公開予定':item.reviewed?'非公開':'公開確認待ち')+
      (item.featured?' ・ 注目作品':''),'mini'));
   const label=make('label','展示タイトル（仮）');
   label.htmlFor='demoGalleryTitle'+item.id;
   const title=make('input');title.type='text';title.id=label.htmlFor;
   title.value=item.title;title.maxLength=60;
   const actions=make('div',undefined,'actions gallery-actions');
   actions.append(
    button('名前を変更',()=>{
     const next=title.value.trim();
     if(!next||next.length>60){setMessage('展示名は1〜60文字で入力してください。');return}
     item.title=next;audit(item.id+'：模擬展示名の変更');
     setMessage('展示名を変更しました。端末内だけの模擬編集です。');render();
    }),
    button('↑ 上へ',()=>{
     [s.gallery[index-1],s.gallery[index]]=[item,s.gallery[index-1]];
     audit(item.id+'：展示順を上へ');render();
    },index===0),
    button('↓ 下へ',()=>{
     [s.gallery[index],s.gallery[index+1]]=[s.gallery[index+1],item];
     audit(item.id+'：展示順を下へ');render();
    },index===s.gallery.length-1),
    button(item.visible?'非公開にする':'公開予定にする',()=>{
     if(!item.reviewed||item.archived)return;
     item.visible=!item.visible;
     if(!item.visible)item.featured=false;
     audit(item.id+'：模擬展示'+(item.visible?'公開予定':'非公開'));
     render();
    },!item.reviewed||item.archived),
    button(item.featured?'注目を解除':'注目にする',()=>{
     if(item.featured)item.featured=false;
     else {
      s.gallery.forEach(other=>other.featured=false);
      item.visible=true;item.featured=true;
     }
     audit(item.id+'：注目作品を変更');render();
    },!item.reviewed||item.archived),
    button(item.reviewed?'確認済み':'模擬承認',()=>{
     item.reviewed=true;audit(item.id+'：模擬公開確認');
     setMessage('公開確認の操作を模擬しました。実際の掲載許可にはなりません。');render();
    },item.reviewed||item.archived),
    button(item.archived?'保管から戻す':'保管（非表示）',()=>{
     item.archived=!item.archived;item.visible=false;item.featured=false;
     audit(item.id+'：'+(item.archived?'非破壊で保管':'保管から復元'));
     setMessage('模擬作品は削除されず、元の一覧に保持されます。');render();
    })
   );
   const fileLabel=make('label','端末内の画像を仮プレビューで差し替える');
   fileLabel.htmlFor='demoGalleryImage'+item.id;
   const file=make('input');file.id=fileLabel.htmlFor;file.type='file';
   file.accept='image/jpeg,image/png,image/webp';file.disabled=item.archived;
   file.addEventListener('change',()=>{
    const chosen=file.files&&file.files[0];
    if(!chosen)return;
    if(!['image/jpeg','image/png','image/webp'].includes(chosen.type)||chosen.size>4*1024*1024||chosen.size<1){
     setMessage('JPEG／PNG／WebP、4MB以下の画像だけ選択してください。');file.value='';return;
    }
    const imageUrl=URL.createObjectURL(chosen);
    if(item.imageUrl)URL.revokeObjectURL(item.imageUrl);
    item.imageUrl=imageUrl;
    audit(item.id+'：端末内画像の仮差し替え');
    setMessage('画像を仮プレビューに反映しました。アップロード・保存はしていません。');
    render();
   });
   details.append(label,title,actions,fileLabel,file);
   row.append(galleryThumb(item),details);editor.append(row);
  });
  const visible=s.gallery.filter(x=>x.visible&&x.reviewed&&!x.archived);
  for(const item of visible){
   const card=make('article',undefined,'entry');
   card.append(galleryThumb(item),make('strong',item.title),
    make('p',item.category,'mini'));
   if(item.featured)card.append(make('p','✦ 注目作品','gallery-featured'));
   preview.append(card);
  }
  if(!visible.length)preview.append(make('p','公開する模擬展示はありません。'));
  $('demoGalleryStatus').textContent=
   '模擬公開 '+visible.length+'件／全'+s.gallery.length+'件。'+
   'このプレビューは保存されず、実ギャラリーには反映されません。';
 }
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
  renderGallery();
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
 $('demoGalleryAdd').addEventListener('click',()=>{
  const title=$('demoGalleryNewTitle').value.trim();
  const category=$('demoGalleryNewCategory').value;
  if(!title||title.length>60){setMessage('模擬作品名は1〜60文字で入力してください。');return}
  if(!['イラスト','動画','音声・楽曲','ファンアート','その他'].includes(category)){
   setMessage('展示の種類を確認してください。');return
  }
  if(s.gallery.length>=30){setMessage('模擬展示の上限は30件です。');return}
  const id='ART-DEMO-'+s.nextExhibit++;
  s.gallery.push({id,title,category,visible:false,featured:false,
   reviewed:false,archived:false,imageUrl:null});
  audit(id+'：非公開の模擬下書きを追加');
  $('demoGalleryNewTitle').value='';
  setMessage('模擬展示を非公開で追加しました。模擬確認前はプレビューには表示されません。');
  render();
 });
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
  releaseGalleryImages(s.gallery);
  s=initial();$('demoGalleryNewTitle').value='';$('demoGalleryNewCategory').value='イラスト';$('demoSearch').value='';$('demoGrantAmount').value='1';
  $('demoOperationId').value='DEMO-OP-001';$('demoDropReply').checked=false;
  setMessage('リハーサルを初期状態へ戻しました。実データは変更していません。');
  render();
 });
 window.addEventListener('pagehide',()=>releaseGalleryImages(s.gallery));
 render();
})();
