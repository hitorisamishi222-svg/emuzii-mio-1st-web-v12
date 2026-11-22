/** Scoped existing-name-review bridge. Add only after source/backup and release review.
 * Uses existing GAS lock, secret, row helpers and audited approval implementation.
 * No new participant, gacha grant, draw, history edit, or automatic sheet creation.
 */
var MIO_REVIEW_LINK_GAS_HEADERS_={
 'emuzii_Web登録':['Web参加ID','認証ハッシュ（変更不可）','ColorSing名','メンシプ申告','登録日時','登録承認','メンシプ確認','照合参加者ID','運営メモ','名前照合状態','統合参加者ID','みお確認','確認日時','端末状態','同名Web登録数','復旧先MIO-ID','運営端末指定','端末整理メモ','整理日時','統合整合チェック','ログインID'],
 'emuzii_参加者':['参加者ID','ColorSing名','予想回答日時','総配信時間予想','歌唱曲数予想','応援コメント','皆勤日数','FA応募数','ガチャ可能回数','備考'],
 'emuzii_ガチャ':['参加者ID','ColorSing名','1ヶ月購入数','3ヶ月購入数','6ヶ月購入数','総ガチャ権利','通常ガチャ手動消費','総残り回数','ラキフェス対象','ラキフェス手動消費','ラキフェス利用可残り（Web4回完了後）','管理メモ','入力チェック','名前チェック','特別付与','Web確定抽選数','ラキフェス状態'],
 'emuzii_当選履歴':['抽選ID（変更不可）','Web参加ID','参加者ID','ColorSing名','種類','景品ID','景品名','確率（抽選時％）','抽選日時','通算何回目','結果','レア度（抽選時）','景品画像URL（抽選時）','被り判定キー（抽選時）'],
 'emuzii_Web管理操作履歴':['日時','操作ID','操作種別','Web参加ID','MIO-ID','変更前','変更後','処理状態','備考','対象名']
};
function mioReviewLinkRelease_(a,d){
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty('MIO_REVIEW_LINK_GAS_RELEASE')==='verified-existing-review-link-v1')return true;
 return !!(a&&d&&/^[a-f0-9]{32}$/.test(d.operationId||'')&&props.getProperty('MIO_OWNER_REVIEW_LINK_GAS_TARGET')===a.webId+':'+a.mioId+':'+d.operationId);
}
function mioReviewLinkSchema_(ss){
 var names=Object.keys(MIO_REVIEW_LINK_GAS_HEADERS_);
 return names.every(function(name){var sh=ss.getSheetByName(name),expected=MIO_REVIEW_LINK_GAS_HEADERS_[name];
  if(!sh||sh.getMaxColumns()<expected.length)return false;
  var headers=sh.getRange(1,1,1,expected.length).getValues()[0];return expected.every(function(x,i){return headers[i]===x;});});
}
function mioReviewLinkTarget_(d,write){
 if(!/^MIO-W-[a-f0-9]{24}$/.test(d.webId||'')||!/^MIO-\d{4}$/.test(d.mioId||'')||typeof d.name!=='string'||!d.name.trim()||d.name.length>40||/[\x00-\x1f]/.test(d.name)||/^[=+\-@]/.test(d.name.trim()))throw Error('復旧対象指定が不正です');
 if(write&&(!/^[a-f0-9]{64}$/.test(d.tokenHash||'')||! /^[a-f0-9]{32}$/.test(d.operationId||'')))throw Error('復旧端末照合が不足しています');
 return {webId:d.webId,mioId:d.mioId,name:d.name};
}
function mioReviewLinkSnapshot_(ss,a,d){
 var p=mioAdminOpsPeople_(ss),target=p.filter(function(r){return r[0]===a.mioId;});
 if(target.length!==1||target[0][1]!==a.name||p.filter(function(r){return mioAdminOpsName_(r[1])===mioAdminOpsName_(a.name);}).length!==1)throw Error('既存参加者の照合が不一致です');
 var g=mioAdminOpsValues_(mioAdminOpsSheet_(ss,'emuzii_ガチャ'),17).filter(function(r){return r[0]===a.mioId;});
 if(g.length!==1||g[0][1]!==a.name||g[0][12]!=='OK'||g[0][13]!=='OK')throw Error('ガチャ台帳の照合が不一致です');
 var row=g[0],total=Number(row[5]),remaining=Number(row[7]),manual=Number(row[6]),other=Number(row[9]),webCount=Number(row[15]);
 var history=mioAdminOpsValues_(mioAdminOpsSheet_(ss,'emuzii_当選履歴'),14).filter(function(r){return r[2]===a.mioId;});
 var seen=Object.create(null);history.forEach(function(r){if(!r[0]||seen[r[0]]||r[10]!=='確定'||r[3]!==a.name)throw Error('確定履歴の照合が必要です');seen[r[0]]=true;});
 if(![total,remaining,manual,other,webCount].every(function(v){return Number.isSafeInteger(v)&&v>=0;})||webCount!==history.length||total-manual-other-history.length!==remaining)throw Error('ガチャ残数の整合を確認できません');
 var web=mioAdminOpsSheet_(ss,'emuzii_Web登録'),all=mioAdminOpsValues_(web,21),found=[],related=[];
 for(var i=0;i<all.length;i++){
  var r=all[i],wid=mioAdminOpsStr_(r[0]);
  if(!wid){if([r[1],r[2],r[4],r[5],r[7],r[10],r[20]].some(function(x){return mioAdminOpsStr_(x)!=='';}))throw Error('Web登録の不完全な行があります');continue;}
  if(wid===a.webId)found.push({row:i+2,c:r});
  if(wid===a.webId||r[7]===a.mioId||r[10]===a.mioId||mioAdminOpsName_(r[2])===mioAdminOpsName_(a.name))related.push({row:i+2,c:r});
 }
 if(found.length>1||related.length!==found.length)throw Error('別の既存ブラウザがあるため復旧を停止しました');
 var w=found[0]||null;
 if(w&&(!/^[a-f0-9]{64}$/.test(w.c[1]||'')||w.c[2]!==a.name||w.c[7]!==a.mioId||!['承認待ち','承認済み'].includes(w.c[5])||w.c[16]==='旧端末'||(w.c[10]&&w.c[10]!==a.mioId)||(w.c[15]&&w.c[15]!==a.mioId)))throw Error('既存Web申請の照合が不一致です');
 var approved=[],pending=[];
 if(w){var view={webId:a.webId,mioId:a.mioId,name:a.name,status:w.c[5],member:w.c[6],verified:w.c[5]==='承認済み'&&w.c[10]===a.mioId&&w.c[11]==='確認済み'&&webIntegrityOk_(w.c)};
  if(w.c[5]==='承認済み'){if(!view.verified||view.member!=='確認済み')throw Error('承認済みWeb登録の本人整合が不足しています');approved.push(view);}else pending.push(view);}
 return {web:web,all:all,w:w,view:{ok:true,schemaReady:true,auditReady:true,releaseReady:mioReviewLinkRelease_(a,d),roster:[{mioId:a.mioId,name:a.name,gacha:{checked:true,total:total,remaining:remaining}}],approvedBrowsers:approved,pending:pending}};
}
function mioReviewLinkOps_(ss,d,lock){
 if(!lock||!lock.hasLock())throw Error('排他制御がありません');
 if(!d||!/^mioReviewLink(?:Read|Prepare|Approve)$/.test(d.action))throw Error('未対応の復旧操作です');
 var write=d.action!=='mioReviewLinkRead',a=mioReviewLinkTarget_(d,write);
 if(!mioReviewLinkSchema_(ss)){
  if(!write)return {ok:true,schemaReady:false,auditReady:false,releaseReady:false,roster:[],approvedBrowsers:[],pending:[]};
  throw Error('連携・監査台帳の確認が未完了です');
 }
 if(write&&!mioReviewLinkRelease_(a,d))throw Error('復旧連携の書き込みは停止中です');
 var state=mioReviewLinkSnapshot_(ss,a,d);
 if(d.action==='mioReviewLinkRead')return state.view;
 if(state.all.some(function(r){return r[0]!==a.webId&&r[1]===d.tokenHash;}))throw Error('端末認証の重複があります');
 if(state.w&&!equal_(state.w.c[1],d.tokenHash))throw Error('元の端末認証が一致しません');
 if(state.w&&(!/^[A-Z0-9]{8}$/.test(loginIdFormat_(state.w.c[20]))||state.all.some(function(r){return r[0]!==a.webId&&loginIdFormat_(r[20])===loginIdFormat_(state.w.c[20]);})))throw Error('ログインIDの確認が必要です');
 if(d.action==='mioReviewLinkPrepare'){
  if(state.w){if(state.w.c[5]!=='承認待ち')throw Error('新規準備できない状態です');return {ok:true,verified:true,participantId:a.webId,status:'承認待ち',integratedParticipantId:a.mioId};}
  if(mioAdminOpsExisting_(mioAdminOpsLog_(ss),d.operationId))throw Error('監査操作IDが既に使用されています');
  var next=webNextRow_(state.web);if(!next||next>state.web.getMaxRows())throw Error('安全な登録行がありません');
  var old=state.web.getRange(next,1,1,21).getValues()[0];
  if([0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,18,20].some(function(i){return mioAdminOpsStr_(old[i])!=='';}))throw Error('既存行を上書きできません');
  var login='',attempt=0;while(attempt++<10){var candidate=loginIdDisplay_(newLoginId_());if(/^[A-Z0-9]{8}$/.test(loginIdFormat_(candidate))&&!state.all.some(function(r){return loginIdFormat_(r[20])===loginIdFormat_(candidate); })){login=candidate;break;}}
  if(!login)throw Error('ログインIDを安全に発行できません');
  // Preserve derived columns N/O/P/T instead of replacing their formulas.
  state.web.getRange(next,1,1,13).setValues([[a.webId,d.tokenHash,safeText_(a.name),'申告なし',new Date(),'承認待ち','未確認',a.mioId,'管理者承認済み既存申請の連携準備','既存一致',a.mioId,'確認待ち','']]);
  state.web.getRange(next,21).setValue(login);
  ensureWebDerivedRow_(state.web,next);SpreadsheetApp.flush();
  var after=mioReviewLinkSnapshot_(ss,a);if(!after.w||after.w.c[5]!=='承認待ち'||!equal_(after.w.c[1],d.tokenHash)||after.w.c[20]!==login)throw Error('準備済み端末の確認に失敗しました');
  return {ok:true,verified:true,participantId:a.webId,status:'承認待ち',integratedParticipantId:a.mioId};
 }
 if(d.action==='mioReviewLinkApprove'){
  if(!state.w||d.memberConfirmed!==true||d.expectedStatus!=='承認待ち')throw Error('本人・メンシプの承認条件を確認してください');
  var result=mioAdminOpsApprove_(ss,{webId:a.webId,mioId:a.mioId,expectedStatus:'承認待ち',memberConfirmed:true,operationId:d.operationId});
  var approved=mioReviewLinkSnapshot_(ss,a);if(result.ok!==true||approved.view.approvedBrowsers.length!==1||!equal_(approved.w.c[1],d.tokenHash))throw Error('承認結果の照合に失敗しました');
  return result;
 }
 throw Error('未対応の復旧操作です');
}
