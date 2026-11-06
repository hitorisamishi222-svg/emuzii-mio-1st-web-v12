'use strict';
// Standalone fictional gallery-management simulation. Never calls a service.
(function(){
const $=id=>document.getElementById(id);
const rooms={gallery:'💎 ギャラリー',icons:'👑 アイコン館',moments:'📸 思い出',events:'🏆 イベント'};
const cats=['イラスト','動画','音声・楽曲','ファンアート','その他'];
const sample=()=>[
{id:'DEMO-01',title:'架空の記念曲',room:'gallery',category:'音声・楽曲',description:'模擬展示です。',credit:'デモ',occurredOn:null,externalUrl:'',reviewed:true,rights:true,privacy:true,visible:true,featured:true,archived:false,epoch:1},
{id:'DEMO-02',title:'架空の歴代アイコン',room:'icons',category:'イラスト',description:'模擬展示です。',credit:'デモ',occurredOn:null,externalUrl:'',reviewed:true,rights:true,privacy:true,visible:true,featured:false,archived:false,epoch:1},
{id:'DEMO-03',title:'非公開の架空アルバム',room:'moments',category:'その他',description:'公開待ちの模擬展示です。',credit:'デモ',occurredOn:null,externalUrl:'',reviewed:false,rights:false,privacy:false,visible:false,featured:false,archived:false,epoch:1}
];
let items=sample(),selected=null,next=4,approvedHash=null,version=1;
const images=new Map(),fields=['title','room','category','description','credit','occurredOn','externalUrl'];
const map={title:'workTitle',room:'workRoom',category:'workCategory',description:'workDescription',credit:'workCredit',occurredOn:'workDate',externalUrl:'workUrl'};
const node=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);if(cls)n.className=cls;return n;};
const button=(label,fn,off=false)=>{const b=node('button',label,'curator-secondary');b.type='button';b.disabled=off;if(!off)b.addEventListener('click',fn);return b;};
const itemBy=id=>items.find(x=>x.id===id);
const eligible=x=>x.visible&&x.reviewed&&x.rights&&x.privacy&&!x.archived;
const publication=()=>items.filter(eligible).map(x=>({id:x.id,title:x.title,room:x.room,category:x.category,description:x.description,featured:x.featured,epoch:x.epoch}));
let published=publication(),history=[{version:1,items:publication()}],orderUndo=null,restoreApproval=null;
let pendingSwitch=null,saveReceipt=null;
const signature=()=>JSON.stringify(items.map(x=>[x.id,...fields.map(k=>x[k]),x.reviewed,x.rights,x.privacy,x.visible,x.featured,x.archived,x.epoch,x.draftRevision||0]));
const status=s=>{$('editStatus').textContent=s;};
function touched(){approvedHash=null;restoreApproval=null;$('simulatePublish').disabled=true;$('restoreHistory').disabled=true;}
function invalidateOrderUndo(){orderUndo=null;$('undoOrder').disabled=true;}
function values(){
const v={};for(const k of fields)v[k]=$(map[k]).value;
v.title=v.title.trim();v.credit=v.credit.trim();v.externalUrl=v.externalUrl.trim();v.occurredOn=v.occurredOn||null;
const bad=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
if(!v.title||v.title.length>60||bad.test(v.title))throw Error('作品タイトルは1〜60文字にしてください。');
if(!Object.hasOwn(rooms,v.room)||!cats.includes(v.category))throw Error('展示室と種類を確認してください。');
if(v.description.length>2000||bad.test(v.description)||v.credit.length>80||bad.test(v.credit))throw Error('作品説明か制作者名を確認してください。');
if(v.occurredOn){
const d=new Date(v.occurredOn+'T00:00:00Z');
if(!/^\d{4}-\d{2}-\d{2}$/.test(v.occurredOn)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v.occurredOn)throw Error('作品日付が正しくありません。');
}
if(v.externalUrl){let u;try{u=new URL(v.externalUrl);}catch{throw Error('URLが正しくありません。');}
if(u.protocol!=='https:'||u.username||u.password||u.hash||/[\u0000-\u0020\u007f]/.test(v.externalUrl))throw Error('紹介先はhttpsのURLだけにしてください。');
}
return v;
}
function fileCandidate(){
const f=$('workImage').files?.[0];if(!f)return null;
if(!['image/png','image/jpeg','image/webp','image/heic','image/heif'].includes(f.type)||f.size<=0||f.size>12*1024*1024)throw Error('写真はJPEG・PNG・WebP・HEICの12MB以下にしてください。');
return f;
}
function forgetImage(id){const p=images.get(id);if(p)URL.revokeObjectURL(p);images.delete(id);}
function imageFor(id,file){if(!file)return;forgetImage(id);images.set(id,URL.createObjectURL(file));}
function clearChecks(){for(const id of ['rightsOk','privacyOk','contentOk'])$(id).checked=false;checkButton();}
function currentValues(x){return Object.fromEntries(fields.map(k=>[k,x[k]]));}
function cleanSelected(){const x=itemBy(selected);if(!x)return false;
try{return JSON.stringify(currentValues(x))===JSON.stringify(values())&&!$('workImage').files?.length;}catch{return false;}
}
function checkButton(){$('approveWork').disabled=!cleanSelected()||!['rightsOk','privacyOk','contentOk'].every(id=>$(id).checked);}
function clearPendingSwitch(){pendingSwitch=null;$('pendingFormSwitch').hidden=true;}
function choose(x){
clearPendingSwitch();
selected=x?.id||null;
for(const k of fields)$(map[k]).value=x?.[k]||'';
if(!x){$('workRoom').value='gallery';$('workCategory').value='イラスト';}
$('workImage').value='';
$('saveWork').textContent=x?'変更を非公開下書きに反映':'非公開下書きを追加';
clearChecks();render();
$('draftRecoveryStatus').textContent=selected&&saveReceipt?.id===selected?
 'この作品の前回の仮保存を照合できます。実DBではありません。':
 '選択した作品について仮保存した後、ここで照合できます。';
}
function save(e){
e.preventDefault();
try{
const v=values(),file=fileCandidate();
if(selected){
const x=itemBy(selected);if(!x)throw Error('作品を選び直してください。');
const changed=JSON.stringify(currentValues(x))!==JSON.stringify(v)||Boolean(file);
if(!changed){status('変更はありません。');return;}
Object.assign(x,v);imageFor(x.id,file);
x.draftRevision=(x.draftRevision||0)+1;
x.epoch++;x.reviewed=false;x.rights=false;x.privacy=false;x.visible=false;x.featured=false;
invalidateOrderUndo();touched();choose(x);rememberDraft(x);status('変更を反映。掲載確認・公開予定は解除したので再確認してください。');
}else{
const id='DEMO-'+String(next++).padStart(2,'0');
const x={id,...v,epoch:1,reviewed:false,rights:false,privacy:false,visible:false,featured:false,archived:false};
items.unshift(x);imageFor(id,file);invalidateOrderUndo();touched();choose(x);rememberDraft(x);
status('非公開の架空展示を追加しました。外部には保存していません。');
}
}catch(err){status(err.message||'入力を確認してください。');}
}
function approve(){
if(!cleanSelected()||!['rightsOk','privacyOk','contentOk'].every(id=>$(id).checked)){status('保存内容と3つの項目を確認してください。');return;}
const x=itemBy(selected);x.rights=true;x.privacy=true;x.reviewed=true;x.epoch++;
invalidateOrderUndo();touched();clearChecks();render();status('模擬確認済みです。公開予定への切替は別操作です。');
}
function invalidateRights(x){
x.epoch++;x.visible=false;x.featured=false;x.reviewed=false;x.rights=false;x.privacy=false;
}
function changeItem(id,kind){
const x=itemBy(id);if(!x)return;
if(kind==='archive'){x.archived=!x.archived;invalidateRights(x);status(x.archived?'模擬保管しました。':'保管を解除しました。公開前に再確認してください。');}
if(kind==='visibility'){
if(x.visible){invalidateRights(x);status('公開予定を解除。再掲載には再確認が必要です。');}
else if(x.archived||!x.reviewed||!x.rights||!x.privacy){status('公開予定にする前に作品の3項目を確認してください。');return;}
else{x.visible=true;status('公開予定に変更。実公開はしていません。');}
}
if(kind==='featured'){if(!eligible(x))return;x.featured=!x.featured;status('注目表示を模擬変更しました。');}
invalidateOrderUndo();touched();clearChecks();render();
}
function filtered(){
const room=$('filterRoom').value,q=$('filterText').value.trim().toLocaleLowerCase('ja');
return items.filter(x=>(room==='all'||x.room===room)&&(x.title+' '+x.id).toLocaleLowerCase('ja').includes(q));
}
function move(id,offset){
const visible=filtered(),at=visible.findIndex(x=>x.id===id),nextItem=visible[at+offset];if(!nextItem)return;
const before=items.map(x=>x.id);
const a=items.findIndex(x=>x.id===id),b=items.findIndex(x=>x.id===nextItem.id);
[items[a],items[b]]=[items[b],items[a]];
touched();orderUndo={before,after:signature()};$('undoOrder').disabled=false;
render();status('表示中の隣の作品だけを入れ替えました。直前の並べ替えは取り消せます。');
}
function undoLastOrder(){
if(!orderUndo||orderUndo.after!==signature()){invalidateOrderUndo();status('別の変更後なので並べ替えの取り消しはできません。');return;}
const byId=new Map(items.map(x=>[x.id,x]));
if(byId.size!==items.length||orderUndo.before.length!==items.length||
 orderUndo.before.some(id=>!byId.has(id))){invalidateOrderUndo();status('作品一覧が変わったため取り消せません。');return;}
items=orderUndo.before.map(id=>byId.get(id));
invalidateOrderUndo();touched();render();status('直前の表示順だけを元に戻しました。掲載許可は変更していません。');
}

function syncDraftRecoveryControls(){
 const x=itemBy(selected);
 $('reloadDemoDraft').disabled=!x;
 $('verifyDemoDraft').disabled=!x||saveReceipt?.id!==x.id;
}
function rememberDraft(x){
 // A receipt is only an in-memory simulation, never durable evidence.
 saveReceipt=Object.freeze({
  id:x.id,revision:x.draftRevision||0,
  metadata:JSON.stringify(currentValues(x)),image:images.get(x.id)||null
 });
 $('draftRecoveryStatus').textContent='仮保存しました（作品 '+x.id+
  '・編集第'+saveReceipt.revision+'版）。「仮保存の内容を照合」で確認できます。';
 syncDraftRecoveryControls();
}
function verifyDemoDraft(){
 const x=itemBy(selected),receipt=saveReceipt;
 if(!x||!receipt||receipt.id!==x.id){
  $('draftRecoveryStatus').textContent='この作品には今回の仮保存記録がありません。';
  return;
 }
 if(unsavedForm()){
  $('draftRecoveryStatus').textContent='未保存の入力があります。保存前の内容を反映するか、保存済みの内容を読み直してください。';
  return;
 }
 if((x.draftRevision||0)!==receipt.revision||
  JSON.stringify(currentValues(x))!==receipt.metadata||
  (images.get(x.id)||null)!==receipt.image){
  $('draftRecoveryStatus').textContent='仮保存後に内容が変わりました。公開前に内容を確認し直してください。';
  return;
 }
 $('draftRecoveryStatus').textContent='照合OK：架空作品 '+x.id+'、編集第'+
  receipt.revision+'版の入力内容が一致しています。実DBには保存していません。';
}
function requestReloadDemoDraft(){
 const x=itemBy(selected);
 if(!x){status('読み直す架空作品を先に選んでください。');return;}
 if(unsavedForm()){
  pendingSwitch={type:'reload',id:x.id};
  $('pendingSwitchText').textContent='未保存の変更を破棄して、「'+x.title+
   '」のこの画面内に仮保存された内容を読み直します。';
  $('pendingFormSwitch').hidden=false;
  status('未保存の入力があります。読み直す前に確認してください。');
  return;
 }
 choose(x);
 status('この画面内の仮保存内容を読み直しました。外部サーバーからは取得していません。');
}

function unsavedForm(){
if($('workImage').files?.length)return true;
if(selected)return !cleanSelected();
return Boolean($('workTitle').value.trim()||$('workDescription').value||
 $('workCredit').value.trim()||$('workDate').value||$('workUrl').value.trim()||
 $('workRoom').value!=='gallery'||$('workCategory').value!=='イラスト');
}

function requestSelection(x){
 if(x?.id&&x.id===selected){status('この作品はすでに編集中です。未保存の入力は保持しています。');return;}
 if(unsavedForm()){
  pendingSwitch={type:'choose',id:x?.id||null};
  $('pendingSwitchText').textContent='入力内容を破棄して'+
   (x?.title?'「'+x.title+'」へ切り替えます。':'新しい作品の入力へ切り替えます。')+
   '保存したい場合は「編集を続ける」を選んでください。';
  $('pendingFormSwitch').hidden=false;
  status('未保存の入力があります。切り替える前に確認してください。');
  return;
 }
 choose(x);status(x?'「'+x.title+'」を編集します。':'新しい作品の入力に切り替えました。');
}
function requestReset(){
 if(unsavedForm()){
  pendingSwitch={type:'reset'};
  $('pendingSwitchText').textContent='未保存の入力を含む架空データを初期化します。'+
   '取り消す場合は「編集を続ける」を選んでください。';
  $('pendingFormSwitch').hidden=false;
  status('未保存の入力があります。初期化する前に確認してください。');
  return;
 }
 reset();
}
function applyPendingSwitch(){
 const action=pendingSwitch;clearPendingSwitch();
 if(!action)return;
 if(action.type==='reset'){reset();return;}
 if(action.type==='reload'){
  const x=itemBy(action.id);
  if(!x||selected!==action.id){status('対象が変更されたため入力を保持しました。');return;}
  choose(x);
  status('未保存の入力を破棄して、この画面内の仮保存内容を読み直しました。');
  return;
 }
 if(action.type!=='choose')return;
 const x=action.id===null?null:itemBy(action.id);
 if(action.id!==null&&!x){status('選択作品が見つかりません。編集中の入力を保持しています。');return;}
 choose(x);
 status('未保存の入力を破棄して'+(x?'「'+x.title+'」へ':'新規入力へ')+'切り替えました。');
}

const historyRecord=()=>history.find(x=>String(x.version)===$('historyVersion').value);
const safeOldWorks=entry=>entry?entry.items.filter(x=>{
 const current=itemBy(x.id);return current&&eligible(current)&&current.epoch===x.epoch;
}):[];
function renderHistoryPreview(){
restoreApproval=null;$('restoreHistory').disabled=true;
const record=historyRecord(),root=$('historyPreview');root.replaceChildren();
$('reviewRestore').disabled=!record;
if(!record){$('historyStatus').textContent='復元する過去の模擬版を選んでください。';return;}
const safe=safeOldWorks(record);
for(const item of safe){
 const el=node('article',undefined,'curator-public-card');
 if(item.featured)el.append(node('span','✦ 注目作品','curator-feature'));
 el.append(node('strong',item.title),node('p',rooms[item.room]+' · '+item.category));
 root.append(el);
}
if(!safe.length)root.append(node('p','復元できる掲載許可済み作品はありません。','curator-small'));
$('historyStatus').textContent='第'+record.version+'版：復元できる作品'+safe.length+'件。失効した権利や非公開作品は除外。';
}
function updateHistoryPicker(){
const el=$('historyVersion'),current=el.value;el.replaceChildren();
const empty=node('option','過去版を選択してください');empty.value='';el.append(empty);
for(const entry of history.slice(0,-1).reverse()){
 const o=node('option','第'+entry.version+'版');o.value=String(entry.version);el.append(o);
}
el.value=history.slice(0,-1).some(x=>String(x.version)===current)?current:'';
renderHistoryPreview();
}
function reviewHistoryRestore(){
const record=historyRecord();
if(!record||unsavedForm()){restoreApproval=null;$('restoreHistory').disabled=true;
 $('historyStatus').textContent='対象の過去版と、保存前の入力がない状態を確認してください。';return;}
const safe=safeOldWorks(record);
restoreApproval=JSON.stringify([record.version,signature(),safe]);
$('restoreHistory').disabled=false;
$('historyStatus').textContent='第'+record.version+'版の'+safe.length+'件を確認済み。復元は現在の模擬公開版への新しい版として記録します。';
}
function restoreHistory(){
const record=historyRecord(),safe=safeOldWorks(record);
if(!record||!restoreApproval||unsavedForm()||
 restoreApproval!==JSON.stringify([record.version,signature(),safe])){
 restoreApproval=null;$('restoreHistory').disabled=true;
 $('historyStatus').textContent='内容が変わりました。過去版をもう一度確認してください。';return;
}
published=safe.map(x=>({...x}));version++;
history.push({version,items:published.map(x=>({...x}))});
invalidateOrderUndo();touched();render();updateHistoryPicker();
$('publishStatus').textContent='模擬公開第'+version+'版として復元しました。過去版を直接書き換えず、失効した作品は復活させません。';
}
function render(){
const list=$('workList');list.replaceChildren();
const visible=filtered();$('countText').textContent='架空作品 '+visible.length+'件 / 全'+items.length+'件';
visible.forEach((x,i)=>{
const art=node('article',undefined,'curator-entry'+(selected===x.id?' is-selected':''));
const head=node('div',undefined,'curator-entry-head'),thumb=node('div',undefined,'curator-thumb'),pic=images.get(x.id);
if(pic){const img=node('img');img.src=pic;img.alt='端末内の仮画像';thumb.append(img);}else thumb.append(node('span',({gallery:'💎',icons:'👑',moments:'📸',events:'🏆'})[x.room]));
const info=node('div');info.append(node('strong',x.title),node('p',rooms[x.room]+' · '+x.category));
const state=x.archived?'保管中':x.visible?'公開予定':x.reviewed?'確認済み・非公開':'確認待ち・非公開';
info.append(node('p',state+(x.featured?' · ✦注目':'')));head.append(thumb,info);art.append(head);
const actions=node('div',undefined,'curator-actions');
actions.append(button('編集',()=>requestSelection(x)),
button('↑ 上へ',()=>move(x.id,-1),i===0),
button('↓ 下へ',()=>move(x.id,1),i===visible.length-1),
button(x.visible?'公開予定を解除':'公開予定にする',()=>changeItem(x.id,'visibility')),
button(x.featured?'注目解除':'注目にする',()=>changeItem(x.id,'featured'),!eligible(x)),
button(x.archived?'保管を解除':'保管する',()=>changeItem(x.id,'archive')));
art.append(actions);list.append(art);
});
if(!visible.length)list.append(node('p','条件に合う架空作品はありません。','curator-status'));
checkButton();syncDraftRecoveryControls();showVisitor();
}
function showVisitor(){
const root=$('visitorPreview');root.replaceChildren();
const selectedRoom=$('visitorRoom').value;
const allApproved=published.filter(x=>{
 const now=itemBy(x.id);
 return now&&eligible(now)&&now.epoch===x.epoch&&Object.hasOwn(rooms,x.room);
});
const shown=allApproved.filter(x=>selectedRoom==='all'||x.room===selectedRoom);
const roomLabel=selectedRoom==='all'?'すべての展示室':rooms[selectedRoom]||'不明な展示室';
$('visitorCount').textContent='架空の模擬公開版 '+version+' · '+roomLabel+'：'+shown.length+
 '件（全展示 '+allApproved.length+'件）';
shown.forEach(x=>{
const card=node('article',undefined,'curator-public-card');
const badge=node('div',undefined,'curator-viewer-badges');
badge.append(node('span',rooms[x.room],'curator-viewer-room'));
badge.append(node('span',x.category,'curator-viewer-category'));
if(x.featured)badge.append(node('span','✦ 注目作品','curator-feature'));
card.append(badge,node('strong',x.title));
if(x.description)card.append(node('p',x.description));
card.append(node('p','架空展示 · 来場者向けプレビュー'));
root.append(card);
});
if(!shown.length)root.append(node('p',
 selectedRoom==='all'?'模擬公開済みの作品はありません。':'この展示室に模擬公開済みの作品はありません。',
 'curator-empty-room'));
}
function review(){
if(unsavedForm()){touched();$('publishStatus').textContent='未保存の入力があります。先に下書きを反映するか新規入力をクリアしてください。';return;}
const now=publication(),oldIds=new Set(published.map(x=>x.id)),newIds=new Set(now.map(x=>x.id));
const added=now.filter(x=>!oldIds.has(x.id)).length,hidden=published.filter(x=>!newIds.has(x.id)).length;
const changed=JSON.stringify(now)!==JSON.stringify(published);
approvedHash=signature();$('simulatePublish').disabled=false;
$('publishStatus').textContent='差分確認：追加 '+added+'件、非掲載 '+hidden+'件、順序・内容変更'+(changed?'あり':'なし')+'。次は架空データだけの模擬公開です。';
}
function publish(){
if(unsavedForm()||!approvedHash||approvedHash!==signature()){touched();$('publishStatus').textContent='状態が変わりました。再確認してください。';return;}
published=publication();version++;history.push({version,items:published.map(x=>({...x}))});invalidateOrderUndo();touched();showVisitor();updateHistoryPicker();
$('publishStatus').textContent='画面内の模擬公開版 '+version+' を更新しました。実サイトとDBは変更していません。';
}
function reset(){
for(const id of images.keys())forgetImage(id);
items=sample();saveReceipt=null;next=4;version=1;published=publication();history=[{version:1,items:published.map(x=>({...x}))}];invalidateOrderUndo();touched();choose(null);updateHistoryPicker();
$('filterRoom').value='all';$('filterText').value='';render();
$('publishStatus').textContent='初期の架空展示へ戻しました。';
status('架空作品を初期化しました。実データは変更していません。');
}
$('curatorForm').addEventListener('submit',save);
$('newWork').addEventListener('click',()=>requestSelection(null));
$('cancelFormSwitch').addEventListener('click',()=>{clearPendingSwitch();status('編集中の入力を保持しました。');});
$('discardFormSwitch').addEventListener('click',applyPendingSwitch);
$('verifyDemoDraft').addEventListener('click',verifyDemoDraft);
$('reloadDemoDraft').addEventListener('click',requestReloadDemoDraft);
for(const k of fields)$(map[k]).addEventListener('input',clearChecks);
$('workImage').addEventListener('change',checkButton);
for(const id of ['rightsOk','privacyOk','contentOk'])$(id).addEventListener('change',checkButton);
$('approveWork').addEventListener('click',approve);
$('clearImage').addEventListener('click',()=>{
$('workImage').value='';
if(selected&&images.has(selected)){forgetImage(selected);invalidateRights(itemBy(selected));invalidateOrderUndo();touched();render();}
clearChecks();status('端末内の仮画像を消しました。本番画像は変更していません。');
});
$('filterRoom').addEventListener('change',render);
$('filterText').addEventListener('input',render);
$('visitorRoom').addEventListener('change',showVisitor);
$('undoOrder').addEventListener('click',undoLastOrder);
$('historyVersion').addEventListener('change',renderHistoryPreview);
$('reviewRestore').addEventListener('click',reviewHistoryRestore);
$('restoreHistory').addEventListener('click',restoreHistory);
$('reviewPublish').addEventListener('click',review);
$('simulatePublish').addEventListener('click',publish);
$('resetDemo').addEventListener('click',requestReset);
window.addEventListener('pagehide',()=>{for(const id of images.keys())forgetImage(id);});
choose(null);updateHistoryPicker();
$('publishStatus').textContent='架空の初期展示を表示しています。実公開ではありません。';
})();