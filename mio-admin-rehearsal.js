'use strict';
// ISOLATED rehearsal. No fetch, storage, cookies, identity, production APIs or writes.
(function(){
 const $=id=>document.getElementById(id);
 // Room keys intentionally match the already-existing public museum links.
 const galleryRooms=Object.freeze({
  gallery:'💎 翠央っ子ギャラリー',
  icons:'👑 歴代アイコン館',
  moments:'📸 思い出アルバム',
  events:'🏆 イベントの記録'
 });
 const knownGalleryRoom=room=>Object.hasOwn(galleryRooms,room);
 const initial=()=>({
  pending:[{id:'REQ-DEMO-1',name:'デモ申請者A'},{id:'REQ-DEMO-2',name:'デモ申請者B'}],
  roster:[{id:'DEMO-01',name:'デモ参加者',tickets:3}],
  incidents:[{id:'INC-DEMO-1',kind:'結果照合',state:'unhandled'},
   {id:'INC-DEMO-2',kind:'端末切替の確認',state:'working'}],
  gallery:[
   {id:'ART-DEMO-1',title:'架空作品A・歌の記憶',category:'音声・楽曲',room:'gallery',visible:true,featured:true,reviewed:true,rightsConfirmed:true,privacyConfirmed:true,approvalEpoch:1,archived:false,imageUrl:null},
   {id:'ART-DEMO-2',title:'架空作品B・思い出の絵',category:'イラスト',room:'icons',visible:true,featured:false,reviewed:true,rightsConfirmed:true,privacyConfirmed:true,approvalEpoch:1,archived:false,imageUrl:null},
   {id:'ART-DEMO-3',title:'架空作品C・準備中',category:'その他',room:'moments',visible:false,featured:false,reviewed:true,rightsConfirmed:true,privacyConfirmed:true,approvalEpoch:1,archived:false,imageUrl:null}
  ],
  ops:new Map(),log:[],selected:null,nextMember:2,nextExhibit:4,unconfirmed:null
 });
 let s=initial();
 // All following snapshots are fictional, memory-only rehearsal data.
 // They are NOT the real gallery DB, release state, rights or authentication.
 const eligible=item=>knownGalleryRoom(item.room)&&item.visible&&item.reviewed&&item.rightsConfirmed&&
   item.privacyConfirmed&&!item.archived;
 const draftDisplay=()=>s.gallery.filter(eligible).map(item=>({
  id:item.id,title:item.title,category:item.category,room:item.room,
  description:item.description||'',credit:item.credit||'',
  occurredOn:item.occurredOn||null,externalUrl:item.externalUrl||'',
  featured:item.featured,approvalEpoch:item.approvalEpoch,imageUrl:null // browser-selected photos are never published
 }));
 const galleryFingerprint=()=>JSON.stringify(s.gallery.map(item=>[
  item.id,item.title,item.category,item.room,item.visible,item.featured,
  item.reviewed,item.rightsConfirmed,item.privacyConfirmed,item.approvalEpoch,
  item.archived,item.imageUrl,item.description||'',item.credit||'',
  item.occurredOn||null,item.externalUrl||''
 ]));
 let galleryPublished=[],galleryReviewFingerprint=null,restoreSelectedRevision=null;
 // A one-step undo only remembers order IDs. It never stores rights approval,
 // copies an image, touches public history, or rewinds moderation state.
 let lastGalleryOrderUndo=null;
 // Keep unsaved in-memory metadata edits across filter and reorder renders.
 // Never serialize these drafts, upload media, or expose them publicly.
 const galleryDetailDrafts=new Map();
 const rememberOrderBeforeMove=order=>{
  lastGalleryOrderUndo={order,after:galleryFingerprint()};
 };
 const canUndoGalleryOrder=()=>lastGalleryOrderUndo!==null&&
  lastGalleryOrderUndo.after===galleryFingerprint();
 let savedDraftRevision=1,savedDraftFingerprint=galleryFingerprint();
 const currentPublication=()=>galleryPublished[galleryPublished.length-1];
 const resetPublication=()=>{
  lastGalleryOrderUndo=null;
  galleryDetailDrafts.clear();
  galleryPublished=[{revision:1,items:draftDisplay()}];
  galleryReviewFingerprint=null;
  restoreSelectedRevision=null;
  savedDraftRevision=1;
  savedDraftFingerprint=galleryFingerprint();
 };
 resetPublication();
 const make=(tag,content,cls)=>{
  const n=document.createElement(tag);
  if(content!==undefined)n.textContent=String(content);
  if(cls)n.className=cls;
  return n;
 };
 const setMessage=(m)=>{$('demoMessage').textContent=m};
 // Match the proposed server-side seven-field create-draft contract.
 // This remains browser-memory-only; no fetch, cookies, or storage.
 let newExhibitReviewed=null;
 const freshExhibitDetails=()=>{
  const title=$('demoGalleryNewTitle').value.trim();
  const category=$('demoGalleryNewCategory').value;
  const kind=$('demoGalleryNewRoom').value;
  const description=$('demoGalleryNewDescription').value;
  const credit=$('demoGalleryNewCredit').value.trim();
  const occurredOn=$('demoGalleryNewOccurred').value||null;
  const externalUrl=$('demoGalleryNewExternal').value.trim();
  const bad=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  if(!title||title.length>60||bad.test(title))throw Error('展示名は1〜60文字で入力してください。');
  if(!['イラスト','動画','音声・楽曲','ファンアート','その他'].includes(category))
   throw Error('展示の種類を選択してください。');
  if(!knownGalleryRoom(kind))throw Error('展示室を選択してください。');
  if(description.length>2000||bad.test(description)||credit.length>80||bad.test(credit))
   throw Error('説明は2000文字以内、制作者名は80文字以内で入力してください。');
  if(occurredOn){
   const date=new Date(occurredOn+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)||!Number.isFinite(date.getTime())||
      date.toISOString().slice(0,10)!==occurredOn)throw Error('正しい作品日付を選んでください。');
  }
  if(externalUrl){
   let url;
   try{url=new URL(externalUrl)}catch{throw Error('紹介先はhttpsのURLだけを指定してください。');}
   if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.hash||
      /[\u0000-\u0020\u007f]/.test(externalUrl)||externalUrl.length>2048)
    throw Error('紹介先はhttpsのURLだけを指定してください。');
  }
  return Object.freeze({kind,title,description,credit,occurredOn,imageUrl:'',externalUrl,category});
 };
 const invalidateNewExhibitReview=()=>{
  newExhibitReviewed=null;
  $('demoGalleryAdd').disabled=true;
  $('demoGalleryNewPreview').textContent=
   '入力内容の確認後にだけ、架空の非公開作品を追加できます。通信・アップロード・保存は行いません。';
 };
 const resetNewExhibitForm=()=>{
  for(const id of ['demoGalleryNewTitle','demoGalleryNewDescription','demoGalleryNewCredit',
   'demoGalleryNewOccurred','demoGalleryNewExternal'])$(id).value='';
  $('demoGalleryNewCategory').value='イラスト';
  $('demoGalleryNewRoom').value='gallery';
  invalidateNewExhibitReview();
 };
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
  const needle=$('demoGallerySearch').value.trim().toLocaleLowerCase('ja');
  const filter=$('demoGalleryFilter').value;
  const editorRoom=$('demoGalleryRoomFilter').value;
  const previewRoom=$('demoGalleryPreviewRoom').value;
  // Filtered ordering must swap ONLY the two adjacent displayed entries.
  // Using the unfiltered array index would silently move an unrelated hidden
  // work when the owner searches or views a single room.
  const included=item=>
   (!needle||(item.title+' '+item.id).toLocaleLowerCase('ja').includes(needle))&&
   (editorRoom==='all'||item.room===editorRoom)&&
   (filter!=='visible'||(item.visible&&!item.archived))&&
   (filter!=='review'||!item.reviewed)&&
   (filter!=='hidden'||!item.visible||item.archived);
  const displayedIndices=s.gallery.flatMap((item,index)=>included(item)?[index]:[]);
  const matches=displayedIndices.length;
  displayedIndices.forEach((index,displayIndex)=>{
   const item=s.gallery[index];
   const row=make('div',undefined,'entry gallery-row');
   const details=make('div');
   details.append(make('strong',item.title),
    make('p',galleryRooms[item.room]+' ・ '+item.category+' ・ '+(item.archived?'保管済み':item.visible?'公開予定':item.reviewed?'非公開':'公開確認待ち')+
      (item.featured?' ・ 注目作品':''),'mini'));
   if(item.description){
    details.append(make('p','作品説明：'+item.description,'mini gallery-exhibit-description'));
   }
   if(item.credit||item.occurredOn||item.externalUrl){
    details.append(make('p',[
     item.credit?'制作者：'+item.credit:null,
     item.occurredOn?'作品日付：'+item.occurredOn:null,
     item.externalUrl?'紹介先：'+item.externalUrl:null
    ].filter(Boolean).join(' ／ '),'mini gallery-exhibit-meta'));
   }
   const pending=galleryDetailDrafts.get(item.id)||{
    title:item.title,description:item.description||'',credit:item.credit||''
   };
   const label=make('label','展示タイトル（仮）');
   label.htmlFor='demoGalleryTitle'+item.id;
   const title=make('input');title.type='text';title.id=label.htmlFor;
   title.value=pending.title??item.title;title.maxLength=60;
   title.disabled=item.archived;
   const metaEditor=make('div',undefined,'gallery-metadata-editor');
   const descriptionLabel=make('label','作品説明を編集（模擬・2000文字以内）');
   descriptionLabel.htmlFor='demoGalleryDescription'+item.id;
   const descriptionInput=make('textarea');
   descriptionInput.id=descriptionLabel.htmlFor;
   descriptionInput.className='gallery-description-input';
   descriptionInput.maxLength=2000;descriptionInput.rows=3;
   descriptionInput.value=pending.description;
   descriptionInput.disabled=item.archived;
   const creditLabel=make('label','制作者・提供者名を編集（模擬・80文字以内）');
   creditLabel.htmlFor='demoGalleryCredit'+item.id;
   const creditInput=make('input');
   creditInput.type='text';creditInput.id=creditLabel.htmlFor;
   creditInput.className='gallery-credit-input';
   creditInput.maxLength=80;creditInput.value=pending.credit;
   creditInput.disabled=item.archived;
   const pendingLabel=make('p','','mini gallery-detail-unsaved');
   const changed=()=>title.value.trim()!==item.title||
    descriptionInput.value!==(item.description||'')||
    creditInput.value.trim()!==(item.credit||'');
   const updatePending=()=>{
    if(changed()){
     galleryDetailDrafts.set(item.id,{
      title:title.value,description:descriptionInput.value,credit:creditInput.value
     });
     pendingLabel.textContent='作品情報を編集中（未保存）。変更確定まで公開履歴は変わりません。';
    }else{
     galleryDetailDrafts.delete(item.id);
     pendingLabel.textContent='';
    }
   };
   title.addEventListener('input',updatePending);
   descriptionInput.addEventListener('input',updatePending);
   creditInput.addEventListener('input',updatePending);
   const saveDetails=()=>{
    if(item.archived)return;
    // Read the DOM on click, not the input-event cache: this also catches
    // programmatic changes between review and commit during offline QA.
    const nextTitle=title.value.trim();
    const description=descriptionInput.value,credit=creditInput.value.trim();
    const bad=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
    if(!nextTitle||nextTitle.length>60||bad.test(nextTitle)){
     setMessage('展示名は1〜60文字で入力してください。');return;
    }
    if(description.length>2000||credit.length>80||
       bad.test(description)||bad.test(credit)){
     setMessage('説明は2000文字以内、制作者名は80文字以内で入力してください。');
     return;
    }
    if(nextTitle===item.title&&description===(item.description||'')&&
       credit===(item.credit||'')){
     galleryDetailDrafts.delete(item.id);
     setMessage('作品情報に変更はありません。');render();return;
    }
    // An atomic mock edit: never mutate ANY field before ALL inputs pass.
    item.title=nextTitle;item.description=description;item.credit=credit;
    // Every changed piece of public-facing content must be reviewed again,
    // including title-only edits. Bump epoch to invalidate older snapshots.
    item.reviewed=false;item.rightsConfirmed=false;item.privacyConfirmed=false;
    item.visible=false;item.featured=false;item.approvalEpoch++;
    galleryDetailDrafts.delete(item.id);
    audit(item.id+'：作品名・説明・制作者の模擬変更（再承認待ち・非公開）');
    setMessage('作品情報を変更しました。以前の模擬掲載確認は失効し、再確認前は公開されません。');
    render();
   };
   const metaActions=make('div',undefined,'actions gallery-metadata-actions');
   metaActions.append(
    button('作品情報をまとめて変更',saveDetails,item.archived,
     'secondary gallery-save-meta'),
    button('編集中の変更を取消',()=>{
     galleryDetailDrafts.delete(item.id);
     setMessage('未保存の作品名・説明・制作者変更を取り消しました。');
     render();
    },item.archived,'secondary gallery-cancel-meta')
   );
   metaEditor.append(descriptionLabel,descriptionInput,creditLabel,
    creditInput,pendingLabel,metaActions);
   if(galleryDetailDrafts.has(item.id))pendingLabel.textContent=
    '作品情報を編集中（未保存）。変更確定まで公開履歴は変わりません。';
   const actions=make('div',undefined,'actions gallery-actions');
   actions.append(
    // Keep the original title shortcut, but route it through the SAME
    // all-fields atomic save and moderation invalidation as the editor.
    button('名前を変更',saveDetails,item.archived),
    button('↑ 上へ',()=>{
     const previous=displayedIndices[displayIndex-1];
     if(previous===undefined)return;
     const oldOrder=s.gallery.map(work=>work.id);
     [s.gallery[previous],s.gallery[index]]=[item,s.gallery[previous]];
     rememberOrderBeforeMove(oldOrder);
     audit(item.id+'：表示中の展示順を上へ');
     setMessage('表示中の展示だけ並べ替えました。絞り込み対象外の作品は動かしていません。');
     render();
    },displayIndex===0),
    button('↓ 下へ',()=>{
     const next=displayedIndices[displayIndex+1];
     if(next===undefined)return;
     const oldOrder=s.gallery.map(work=>work.id);
     [s.gallery[index],s.gallery[next]]=[s.gallery[next],item];
     rememberOrderBeforeMove(oldOrder);
     audit(item.id+'：表示中の展示順を下へ');
     setMessage('表示中の展示だけ並べ替えました。絞り込み対象外の作品は動かしていません。');
     render();
    },displayIndex===displayedIndices.length-1),
    button(item.visible?'非公開にする':'公開予定にする',()=>{
     if(!item.reviewed||item.archived)return;
     item.visible=!item.visible;
     if(!item.visible){
      // Re-enabling a temporarily hidden work cannot silently resurrect
      // its old published snapshots; it requires a new reviewed release.
      item.featured=false;item.approvalEpoch++;
     }
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
     if(!item.rightsConfirmed||!item.privacyConfirmed)return;
     item.reviewed=true;item.approvalEpoch++;
     audit(item.id+'：模擬公開確認（審査世代 '+item.approvalEpoch+'）');
     setMessage('公開確認の操作を模擬しました。実際の掲載許可にはなりません。');render();
    },item.reviewed||item.archived||!item.rightsConfirmed||!item.privacyConfirmed),
    button(item.archived?'保管から戻す':'保管（非表示）',()=>{
     item.archived=!item.archived;
     if(item.archived)item.approvalEpoch++;
     item.visible=false;item.featured=false;
     audit(item.id+'：'+(item.archived?'非破壊で保管':'保管から復元'));
     setMessage('模擬作品は削除されず、元の一覧に保持されます。');render();
    }),
    button('⇈ 先頭へ',()=>{
     if(displayIndex===0)return;
     // Rotate only matching positions; other rooms and hidden entries retain
     // their original array positions even during filtered curator actions.
     const oldOrder=s.gallery.map(work=>work.id);
     const reordered=displayedIndices.map(i=>s.gallery[i]);
     const [moving]=reordered.splice(displayIndex,1);
     reordered.unshift(moving);
     displayedIndices.forEach((position,i)=>{s.gallery[position]=reordered[i];});
     rememberOrderBeforeMove(oldOrder);
     audit(item.id+'：絞り込み内の先頭へ移動');
     setMessage('表示中の先頭へ移動しました。絞り込み対象外の作品は動かしていません。');
     render();
    },displayIndex===0),
    button('⇊ 末尾へ',()=>{
     if(displayIndex===displayedIndices.length-1)return;
     const oldOrder=s.gallery.map(work=>work.id);
     const reordered=displayedIndices.map(i=>s.gallery[i]);
     const [moving]=reordered.splice(displayIndex,1);
     reordered.push(moving);
     displayedIndices.forEach((position,i)=>{s.gallery[position]=reordered[i];});
     rememberOrderBeforeMove(oldOrder);
     audit(item.id+'：絞り込み内の末尾へ移動');
     setMessage('表示中の末尾へ移動しました。絞り込み対象外の作品は動かしていません。');
     render();
    },displayIndex===displayedIndices.length-1)
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
   const approval=make('div',undefined,'gallery-review-checks');
   if(!item.reviewed){
    for(const [key,text] of [
     ['rightsConfirmed','作品の使用・掲載許可を確認した（模擬）'],
     ['privacyConfirmed','画像・説明に個人情報がないことを確認した（模擬）']
    ]){
     const reviewLabel=make('label');
     const check=make('input');check.type='checkbox';check.checked=item[key]===true;
     check.addEventListener('change',()=>{
      item[key]=check.checked;
      setMessage('模擬確認を更新しました。実際の許可記録にはなりません。');
      render();
     });
     reviewLabel.append(check,make('span',text));
     approval.append(reviewLabel);
    }
    approval.append(make('p','両方の模擬確認を終えるまで承認ボタンは使えません。','mini'));
   }else{
    approval.append(make('p','模擬確認：掲載許可と個人情報確認は有効です。取消時は即時非公開になります。','mini'));
    const revoke=make('div',undefined,'actions');
    for(const [key,label] of [
     ['rightsConfirmed','掲載許可を取り消す（模擬）'],
     ['privacyConfirmed','個人情報確認を取り消す（模擬）']
    ]){
     revoke.append(button(label,()=>{
      // Emergency takedown affects mock visitors immediately without
      // waiting for draft save or a publication revision.
      item[key]=false;item.reviewed=false;
      item.visible=false;item.featured=false;
      if(item.imageUrl){URL.revokeObjectURL(item.imageUrl);item.imageUrl=null;}
      audit(item.id+'：'+label+'・掲載を即時停止（模擬）');
      setMessage('模擬展示を非公開にしました。再承認しても古い公開履歴は自動で復活しません。');
      render();
     },item.archived));
    }
    approval.append(revoke);
   }
   const roomLabel=make('label','配置する展示室（模擬）');
   roomLabel.htmlFor='demoGalleryRoom'+item.id;
   const roomSelect=make('select');roomSelect.id=roomLabel.htmlFor;
   roomSelect.className='gallery-room-select';
   for(const [value,name] of Object.entries(galleryRooms)){
    const opt=make('option',name);opt.value=value;
    roomSelect.append(opt);
   }
   roomSelect.value=item.room;
   roomSelect.disabled=item.archived;
   roomSelect.addEventListener('change',()=>{
    if(item.archived||!knownGalleryRoom(roomSelect.value))return;
    item.room=roomSelect.value;
    audit(item.id+'：配置先を'+galleryRooms[item.room]+'に変更（模擬）');
    setMessage('展示室の配置を変更しました。仮保存・確認後にだけ模擬公開できます。');
    render();
   });
   details.append(label,title,metaEditor,roomLabel,roomSelect,approval,actions,fileLabel,file);
   row.append(galleryThumb(item),details);editor.append(row);
  });
  $('demoGalleryUndoOrder').disabled=!canUndoGalleryOrder();
  $('demoGalleryMatchCount').textContent='全'+s.gallery.length+'件のうち'+matches+'件を表示中。';
  if(!matches)editor.append(make('p','条件に合う架空展示はありません。','mini'));
  const visible=s.gallery.filter(x=>eligible(x)&&
   (previewRoom==='all'||x.room===previewRoom));
  for(const item of visible){
   const card=make('article',undefined,'entry');
   card.append(galleryThumb(item),make('strong',item.title),
    make('p',galleryRooms[item.room]+' ・ '+item.category,'gallery-room-label'));
   if(item.featured)card.append(make('p','✦ 注目作品','gallery-featured'));
   preview.append(card);
  }
  if(!visible.length)preview.append(make('p','公開する模擬展示はありません。'));
  // Render the last "published" snapshot separately from the working draft.
  // A moderation/archive takedown wins even against an older published version.
  const publication=currentPublication(),published=$('demoGalleryPublished');
  published.replaceChildren();
  const byId=new Map(s.gallery.map(item=>[item.id,item]));
  let publishedCount=0;
  for(const exhibit of publication.items){
   const actual=byId.get(exhibit.id);
   // A later owner hide or revocation wins over every historical snapshot.
   if(!actual||!eligible(actual)||actual.approvalEpoch!==exhibit.approvalEpoch||
      (previewRoom!=='all'&&exhibit.room!==previewRoom))continue;
   const card=make('article',undefined,'entry');
   card.append(galleryThumb(exhibit),make('strong',exhibit.title),
    make('p',galleryRooms[exhibit.room]+' ・ '+exhibit.category,'gallery-room-label'));
   if(exhibit.featured)card.append(make('p','✦ 注目作品','gallery-featured'));
   published.append(card);publishedCount++;
  }
  if(!publishedCount)published.append(make('p','この模擬公開版に表示可能な作品はありません。'));
  $('demoGalleryPublishedStatus').textContent=
   '模擬公開版 第'+publication.revision+'版・表示可能 '+publishedCount+
   '件／版内 '+publication.items.length+'件。実際の公開サイトは変わりません。';
  // Historical publication snapshots stay immutable; every restore is a
  // NEW version. Only currently eligible works can appear in an old preview.
  const history=galleryPublished.slice(0,-1).reverse();
  if(!history.some(v=>v.revision===restoreSelectedRevision)){
   restoreSelectedRevision=history[0]?.revision??null;
  }
  const select=$('demoGalleryHistoryVersion');
  select.replaceChildren();
  if(!history.length){
   const empty=make('option','復元できる公開履歴はありません');
   empty.value='';select.append(empty);select.disabled=true;
  }else{
   select.disabled=false;
   for(const entry of history){
    const option=make('option','第'+entry.revision+'版（記録 '+entry.items.length+'作品）');
    option.value=String(entry.revision);select.append(option);
   }
   select.value=String(restoreSelectedRevision);
  }
  const selected=history.find(v=>v.revision===restoreSelectedRevision);
  const restoreItems=(selected?.items||[]).filter(item=>{
   const actual=byId.get(item.id);
   return actual&&eligible(actual)&&actual.approvalEpoch===item.approvalEpoch;
  }).map(item=>({...item}));
  const restorePreview=$('demoGalleryRestorePreview');
  restorePreview.replaceChildren();
  let previewed=0;
  for(const item of restoreItems){
   if(previewRoom!=='all'&&item.room!==previewRoom)continue;
   const card=make('article',undefined,'entry');
   card.append(galleryThumb(item),make('strong',item.title),
    make('p',galleryRooms[item.room]+' ・ '+item.category,'gallery-room-label'));
   if(item.featured)card.append(make('p','✦ 注目作品','gallery-featured'));
   restorePreview.append(card);previewed++;
  }
  if(!previewed)restorePreview.append(make('p',
   selected?'この展示室に復元可能な作品はありません。':'過去の公開履歴はありません。','mini'));
  $('demoGalleryRestoreSummary').textContent=selected?
   '第'+selected.revision+'版から復元候補 '+restoreItems.length+'件（旧版の記録は'+
   selected.items.length+'件）。現在の非公開・保管・承認停止を優先します。復元時は第'+
   (publication.revision+1)+'版として記録します。':
   '初回の模擬公開版です。復元できる履歴はありません。';
  const changed=galleryReviewFingerprint!==null&&
   galleryReviewFingerprint!==galleryFingerprint();
  if(changed){
   galleryReviewFingerprint=null;
   $('demoGalleryDifference').textContent='編集内容が変わりました。公開前に変更点を再確認してください。';
  }
  const target=draftDisplay();
  const identical=JSON.stringify(publication.items)===JSON.stringify(target);
  const hasUnsavedChanges=savedDraftFingerprint!==galleryFingerprint();
  $('demoGalleryDraftStatus').textContent='非公開の模擬下書き 第'+savedDraftRevision+
   '版／'+(hasUnsavedChanges?'未保存の編集があります':'編集中の内容は仮保存済み')+
   '。実DBには保存していません。';
  $('demoGallerySaveDraft').disabled=!hasUnsavedChanges;
  $('demoGalleryCommit').disabled=!galleryReviewFingerprint||identical||
   hasUnsavedChanges||s.gallery.some(item=>item.visible&&!eligible(item));
  $('demoGalleryRollback').disabled=!selected||
   JSON.stringify(restoreItems)===JSON.stringify(publication.items);
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
 const validForPublication=()=>!s.gallery.some(item=>item.visible&&!eligible(item))&&
  s.gallery.filter(item=>item.featured).every(item=>eligible(item))&&
  s.gallery.filter(item=>item.featured).length<=1;
 $('demoGallerySaveDraft').addEventListener('click',()=>{
  const signature=galleryFingerprint();
  if(signature===savedDraftFingerprint){render();return;}
  savedDraftRevision++;
  savedDraftFingerprint=signature;
  galleryReviewFingerprint=null;
  audit('ギャラリー非公開下書きを第'+savedDraftRevision+'版へ模擬保存');
  $('demoGalleryDifference').textContent='下書きを仮保存しました。公開版への変更には内容の確認が必要です。';
  setMessage('端末内の非公開下書きを模擬保存しました。本番には送信していません。');
  render();
 });
 $('demoGalleryReview').addEventListener('click',()=>{
  if(savedDraftFingerprint!==galleryFingerprint()){
   galleryReviewFingerprint=null;
   $('demoGalleryDifference').textContent='未保存の編集があります。先に下書きを仮保存してください。';
   render();return;
  }
  if(!validForPublication()){
   galleryReviewFingerprint=null;
   $('demoGalleryDifference').textContent='公開条件がそろっていない展示があります。掲載許可・個人情報確認と公開対象を再確認してください。';
   render();return;
  }
  const target=draftDisplay(),previous=currentPublication().items;
  if(JSON.stringify(target)===JSON.stringify(previous)){
   galleryReviewFingerprint=null;
   $('demoGalleryDifference').textContent='公開済みの模擬版と変更がありません。';
   render();return;
  }
  const previousIds=new Set(previous.map(item=>item.id));
  const targetIds=new Set(target.map(item=>item.id));
  const additions=target.filter(item=>!previousIds.has(item.id)).length;
  const hidden=previous.filter(item=>!targetIds.has(item.id)).length;
  const changed=target.filter(item=>{
   const old=previous.find(x=>x.id===item.id);
   return old&&JSON.stringify(old)!==JSON.stringify(item);
  }).length;
  const orderChanged=target.map(item=>item.id).join('|')!==
   previous.map(item=>item.id).join('|');
  galleryReviewFingerprint=galleryFingerprint();
  $('demoGalleryDifference').textContent='確認結果：追加 '+additions+
   '件／非表示 '+hidden+'件／表示内容変更 '+changed+
   '件／並び順変更 '+(orderChanged?'あり':'なし')+
   '。内容が正しければ「模擬公開」を押してください。';
  render();
 });
 $('demoGalleryCommit').addEventListener('click',()=>{
  if(galleryReviewFingerprint===null||
     galleryReviewFingerprint!==galleryFingerprint()||
     savedDraftFingerprint!==galleryFingerprint()||
     !validForPublication()){
   galleryReviewFingerprint=null;
   $('demoGalleryDifference').textContent='確認後に変更されたか、公開条件が満たされていません。再確認してください。';
   render();return;
  }
  const items=draftDisplay();
  if(JSON.stringify(items)===JSON.stringify(currentPublication().items)){
   galleryReviewFingerprint=null;render();return;
  }
  const revision=currentPublication().revision+1;
  restoreSelectedRevision=currentPublication().revision;
  galleryPublished.push({revision,items});
  galleryReviewFingerprint=null;
  audit('ギャラリーの模擬公開版を第'+revision+'版へ変更');
  $('demoGalleryDifference').textContent='第'+revision+'版へ模擬公開しました。実サイトや保存先には反映されません。';
  setMessage('展示の模擬公開を確認しました。本番は一切変更していません。');
  render();
 });
 $('demoGalleryRollback').addEventListener('click',()=>{
  const selected=galleryPublished.find(entry=>
   entry.revision===restoreSelectedRevision&&entry!==currentPublication());
  if(!selected){render();return;}
  // NEVER reinstate a hidden, archived or unapproved item from history.
  // Restoring an older version does not edit the ongoing working draft.
  const byId=new Map(s.gallery.map(item=>[item.id,item]));
  const items=selected.items.filter(item=>{
   const current=byId.get(item.id);
   return current&&eligible(current)&&current.approvalEpoch===item.approvalEpoch;
  }).map(item=>({...item}));
  if(JSON.stringify(items)===JSON.stringify(currentPublication().items)){
   $('demoGalleryDifference').textContent='選択した履歴は現在の公開版と同じです。復元は不要です。';
   render();return;
  }
  const revision=currentPublication().revision+1;
  const replaced=currentPublication().revision;
  galleryPublished.push({revision,items});
  restoreSelectedRevision=replaced;
  galleryReviewFingerprint=null;
  audit('ギャラリー模擬公開版を第'+selected.revision+'版から復元 → 第'+revision+'版');
  $('demoGalleryDifference').textContent='第'+selected.revision+'版を第'+revision+
   '版として模擬復元しました。履歴は保持し、非公開・権利停止の作品は再掲載していません。';
  setMessage('選択した公開履歴の復元を模擬しました。本番や旧データへの変更はありません。');
  render();
 });
 $('demoGalleryHistoryVersion').addEventListener('change',()=>{
  const value=$('demoGalleryHistoryVersion').value;
  const found=galleryPublished.find(entry=>String(entry.revision)===value&&
   entry!==currentPublication());
  restoreSelectedRevision=found?found.revision:null;
  render();
 });
 $('demoGalleryUndoOrder').addEventListener('click',()=>{
  if(!canUndoGalleryOrder()){lastGalleryOrderUndo=null;render();return;}
  const ids=lastGalleryOrderUndo.order;
  const works=new Map(s.gallery.map(item=>[item.id,item]));
  if(ids.length!==s.gallery.length||works.size!==ids.length||
     ids.some(id=>!works.has(id))){
   lastGalleryOrderUndo=null;render();return;
  }
  // The exact work objects (including current moderation and temporary image)
  // stay untouched. Only their positions are restored.
  s.gallery=ids.map(id=>works.get(id));
  lastGalleryOrderUndo=null;
  audit('直前の模擬並び替えだけを取り消し');
  setMessage('直前の並び替えを取り消しました。公開履歴・承認・画像は戻していません。');
  render();
 });
 $('demoGallerySearch').addEventListener('input',render);
 $('demoGalleryFilter').addEventListener('change',render);
 $('demoGalleryRoomFilter').addEventListener('change',render);
 $('demoGalleryPreviewRoom').addEventListener('change',render);
 for(const id of ['demoGalleryNewTitle','demoGalleryNewCategory','demoGalleryNewRoom',
  'demoGalleryNewDescription','demoGalleryNewCredit','demoGalleryNewOccurred',
  'demoGalleryNewExternal']){
  $(id).addEventListener('input',invalidateNewExhibitReview);
  $(id).addEventListener('change',invalidateNewExhibitReview);
 }
 $('demoGalleryNewReview').addEventListener('click',()=>{
  let details;
  try{details=freshExhibitDetails()}catch(error){
   invalidateNewExhibitReview();
   setMessage(error.message);
   $('demoGalleryNewPreview').textContent=error.message;
   return;
  }
  if(s.gallery.length>=30){
   invalidateNewExhibitReview();
   setMessage('模擬展示の上限は30件です。');return;
  }
  newExhibitReviewed=JSON.stringify(details);
  const preview=$('demoGalleryNewPreview');
  preview.replaceChildren(
   make('strong','確認済み：非公開の仮下書き'),
   make('p','作品名：'+details.title),
   make('p','展示室：'+galleryRooms[details.kind]+' ／ '+details.category),
   make('p','制作者：'+(details.credit||'未記入')),
   make('p','作品日付：'+(details.occurredOn||'未設定')),
   make('p','説明：'+(details.description||'未記入')),
   make('p','紹介先：'+(details.externalUrl||'未設定')),
   make('p','実DB保存・ファイル送信・公開は行いません。')
  );
  $('demoGalleryAdd').disabled=false;
  setMessage('内容を確認しました。架空の非公開下書きとして追加できます。');
 });
 $('demoGalleryAdd').addEventListener('click',()=>{
  let details;
  try{details=freshExhibitDetails()}catch(error){
   invalidateNewExhibitReview();setMessage(error.message);return;
  }
  if(!newExhibitReviewed||newExhibitReviewed!==JSON.stringify(details)){
   invalidateNewExhibitReview();
   setMessage('追加前に最新の入力内容を確認してください。');return;
  }
  if(s.gallery.length>=30){
   invalidateNewExhibitReview();setMessage('模擬展示の上限は30件です。');return;
  }
  const id='ART-DEMO-'+s.nextExhibit++;
  s.gallery.push({
   id,title:details.title,category:details.category,room:details.kind,
   description:details.description,credit:details.credit,
   occurredOn:details.occurredOn,externalUrl:details.externalUrl,
   visible:false,featured:false,
   reviewed:false,rightsConfirmed:false,privacyConfirmed:false,approvalEpoch:0,archived:false,
   imageUrl:null
  });
  audit(id+'：内容確認後に非公開の模擬下書きを追加');
  resetNewExhibitForm();
  setMessage('架空の非公開下書きを追加しました。実DB保存や公開は行っていません。');
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
  s=initial();resetPublication();
  $('demoGalleryDifference').textContent='公開済みの版との差分はまだ確認していません。';
  resetNewExhibitForm();
  $('demoGalleryRoomFilter').value='all';
  $('demoGalleryPreviewRoom').value='all';
  $('demoGallerySearch').value='';$('demoGalleryFilter').value='all';$('demoSearch').value='';$('demoGrantAmount').value='1';
  $('demoOperationId').value='DEMO-OP-001';$('demoDropReply').checked=false;
  setMessage('リハーサルを初期状態へ戻しました。実データは変更していません。');
  render();
 });
 window.addEventListener('pagehide',()=>releaseGalleryImages(s.gallery));
 render();
})();
