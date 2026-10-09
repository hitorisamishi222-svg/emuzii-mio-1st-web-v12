const $=id=>document.getElementById(id);const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=String(text);return el};
const page=document.body.dataset.page;
if(page==='attendance'){
 const done=new Set([1,2,3,4,5,6,7,9,10,11,12,13,15,18,22]);
 const days=$('attDays');for(let i=1;i<=31;i++){const b=make('button','day'+(done.has(i)?' done':''),i);b.type='button';b.setAttribute('aria-label',i+'日 '+(done.has(i)?'参加済み':'未記録')+' サンプル');b.addEventListener('click',()=>{days.querySelectorAll('.day').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('attDetail').textContent=i+'日：'+(done.has(i)?'チェックイン済み':'未記録')+'（サンプル。実際のデータは変更しません）'});days.appendChild(b)}
 $('attTotal').textContent=String(done.size);$('attDaysLeft').textContent=String(31-done.size);
}
if(page==='mypage'){
 const feeds={
 history:[['10月22日','皆勤賞に参加（サンプル）'],['10月18日','皆勤賞に参加（サンプル）'],['10月15日','15日記念を達成（サンプル）']],
 prizes:[['サンプル当選履歴','SR：ブルーダイヤ（架空）'],['サンプル当選履歴','R：記念デジタルカード（架空）']],
 works:[['ギャラリー提出','サンプル画像・公開承認待ち'],['動画申請','サンプル動画・審査中']]};
 const render=key=>{const feed=$('profileFeed');feed.replaceChildren();for(const [title,body] of feeds[key]){const box=make('div','item');box.append(make('strong',null,title),make('p',null,body));feed.append(box)}};
 for(const t of document.querySelectorAll('[data-profile-tab]'))t.addEventListener('click',()=>{document.querySelectorAll('[data-profile-tab]').forEach(x=>x.setAttribute('aria-selected',String(x===t)));render(t.dataset.profileTab)});
 render('history');
}
if(page==='admin'){
 let stopped=false;const btn=$('demoStop');btn.addEventListener('click',()=>{stopped=!stopped;btn.setAttribute('aria-pressed',String(stopped));btn.textContent=stopped?'投稿機能の停止を解除する':'投稿機能を停止する';$('stopFeedback').textContent='サンプル停止状態：'+(stopped?'停止中':'通常')+'（実際の投稿権限には影響しません）'});
 const validPreviewUrl=raw=>{
  const value=raw.trim();if(!value)return {ok:true,url:''};
  if(value.length>2048)return {ok:false,error:'URLが長すぎます'};
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?
    {ok:true,url:url.href}:{ok:false,error:'URLはhttps://で始まる安全なアドレスを入力してください'}}
  catch{return {ok:false,error:'URLの形式を確認してください'}}
 };
 const jstDate=value=>{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
  const dt=new Date(value+':00+09:00');
  return Number.isFinite(dt.getTime())&&new Date(dt.getTime()+9*3600000).toISOString().slice(0,16)===value?dt:null;
 };
 const renderPreview=(id,title,body,note,link)=>{
  const root=$(id);root.replaceChildren();
  root.append(make('strong',null,title),make('p',null,body),make('span','preview-status',note));
  if(link){const a=make('a',null,'リンクを確認 ↗');a.href=link;a.target='_blank';a.rel='noopener noreferrer';root.append(a)}
 };
 $('previewNotice').addEventListener('click',()=>{
  const title=$('newsTitle').value.trim(),body=$('newsBody').value.trim();
  const level=$('newsLevel').value,url=validPreviewUrl($('newsLink').value);
  if(!title||!body){$('noticePreview').textContent='タイトルと本文を入力してください';return}
  if(title.length>80||body.length>500||!['通常','重要','緊急'].includes(level)){
   $('noticePreview').textContent='文字数または種類を確認してください';return
  }
  if(!url.ok){$('noticePreview').textContent=url.error;return}
  renderPreview('noticePreview',title,body,'［'+level+'］プレビューのみ・未公開',url.url);
 });
 $('previewSchedule').addEventListener('click',()=>{
  const title=$('scheduleTitle').value.trim(),body=$('scheduleBody').value.trim();
  const start=jstDate($('scheduleStart').value),end=jstDate($('scheduleEnd').value);
  const url=validPreviewUrl($('scheduleLink').value);
  if(!title||title.length>80||body.length>500){
   $('schedulePreview').textContent='配信タイトルと文字数を確認してください';return
  }
  if(!start||!end||end.getTime()<=start.getTime()){
   $('schedulePreview').textContent='開始日時・終了日時を正しく入力してください（終了は開始より後）';return
  }
  if(!url.ok){$('schedulePreview').textContent=url.error;return}
  const now=Date.now(),state=end.getTime()<=now?'終了済み':start.getTime()<=now?'LIVE':'NEXT LIVE';
  const fmt=dt=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(dt);
  const detail=fmt(start)+' 〜 '+fmt(end)+(body?'\n'+body:'');
  renderPreview('schedulePreview',title,detail,state+'（表示デモ・未公開）',url.url);
 });
 const q=[{id:1,name:'サンプル作品A',description:'ファンアート申請（架空）'},{id:2,name:'サンプル作品B',description:'動画リンク申請（架空）'},{id:3,name:'サンプル作品C',description:'写真掲載申請（架空）'}];const queue=$('moderationQueue');
 const refresh=()=>{$('adminPendingCount').textContent=String(q.length);queue.replaceChildren();if(!q.length){queue.append(make('p','muted','サンプル審査は完了しました。'));return;}for(const item of q){const card=make('div','mod-card'),title=make('strong',null,item.name),info=make('p',null,item.description),actions=make('div','button-row');for(const [label,decision] of [['承認（デモ）','承認'],['却下（デモ）','却下']]){const b=make('button','button '+(decision==='却下'?'ghost':''),label);b.type='button';b.addEventListener('click',()=>{q.splice(q.indexOf(item),1);$('moderationFeedback').textContent=item.name+'：'+decision+'（画面内のテスト処理です）';refresh()});actions.append(b)}card.append(title,info,actions);queue.append(card)}};refresh();
}
