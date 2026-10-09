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
 $('previewNotice').addEventListener('click',()=>{const title=$('newsTitle').value.trim(),body=$('newsBody').value.trim();$('noticePreview').replaceChildren(make('strong',null,title||'タイトル未入力'),make('p',null,body||'本文未入力'));});
 const q=[{id:1,name:'サンプル作品A',description:'ファンアート申請（架空）'},{id:2,name:'サンプル作品B',description:'動画リンク申請（架空）'},{id:3,name:'サンプル作品C',description:'写真掲載申請（架空）'}];const queue=$('moderationQueue');
 const refresh=()=>{$('adminPendingCount').textContent=String(q.length);queue.replaceChildren();if(!q.length){queue.append(make('p','muted','サンプル審査は完了しました。'));return;}for(const item of q){const card=make('div','mod-card'),title=make('strong',null,item.name),info=make('p',null,item.description),actions=make('div','button-row');for(const [label,decision] of [['承認（デモ）','承認'],['却下（デモ）','却下']]){const b=make('button','button '+(decision==='却下'?'ghost':''),label);b.type='button';b.addEventListener('click',()=>{q.splice(q.indexOf(item),1);$('moderationFeedback').textContent=item.name+'：'+decision+'（画面内のテスト処理です）';refresh()});actions.append(b)}card.append(title,info,actions);queue.append(card)}};refresh();
}
