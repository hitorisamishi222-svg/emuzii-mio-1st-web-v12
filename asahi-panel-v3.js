/* ASAHI on-page copy panel v3.0. No network or external data transfer. */
window.AsahiPanelInstall = function asahiPanelInstall(){
  'use strict';
  if(window.__asahiPanelClose){window.__asahiPanelClose();return;}
  var host=document.createElement('div');
  host.id='asahi-selection-helper';
  var s=host.attachShadow({mode:'open'});
  s.innerHTML='<style>:host{all:initial;font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:#f9fcff}#p{position:fixed;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);width:min(322px,96vw);z-index:2147483647;background:#10253d;color:#fff;border:1px solid #80b4d4;box-shadow:0 5px 24px #0008;border-radius:13px;padding:8px;touch-action:manipulation;box-sizing:border-box}#head{display:flex;justify-content:space-between;align-items:center;touch-action:none;cursor:move;padding:3px 3px 7px;font-weight:bold}#buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}button{font:700 13px -apple-system,sans-serif;color:#071f38;background:#d6ebfa;border:0;border-radius:8px;padding:10px 3px;min-height:41px;touch-action:manipulation}button.on{background:#ffe7a5}button.mint{background:#a9edd3}button.pink{background:#ead3ff}#close{background:#314d67;color:#fff;min-height:29px;padding:4px 10px}#msg{min-height:25px;line-height:1.5;font:12px -apple-system,sans-serif;color:#e0eafa;padding:8px 3px 2px;white-space:pre-line}#manual{display:none;width:100%;min-height:70px;background:#09182a;color:#fff;border:1px solid #6f94b5;border-radius:6px;font:12px monospace;box-sizing:border-box;margin-top:5px}</style><div id="p"><div id="head"><span>🐤 選択・コピペ　☰ 移動</span><button id="close" aria-label="閉じる">×</button></div><div id="buttons"><button id="all">全選択</button><button id="start">始点指定</button><button id="end">終点指定</button><button id="copy" class="mint">コピー</button><button id="pick">貼付先</button><button id="paste" class="pink">貼り付け</button></div><div id="msg" role="status">始点→ページ内をタップ→終点→タップ→コピー</div><textarea id="manual" readonly aria-label="手動コピー欄"></textarea></div>';
  document.documentElement.appendChild(host);
  var $=function(id){return s.getElementById(id)}, panel=$('p'), info=$('msg');
  var mode='', anchor=null, finish=null, cached='', target=null, listeners=[], lastSelectionRange=null;
  function message(x){info.textContent=x;}
  function buttonMode(v){mode=v;['start','end','pick'].forEach(function(id){$(id).classList.toggle('on',id===v)});}
  function cleanup(){
    listeners.forEach(function(x){document.removeEventListener(x[0],x[1],x[2]);});
    host.remove();delete window.__asahiPanelClose;
  }
  window.__asahiPanelClose=cleanup;
  $('close').onclick=cleanup;
  function point(event){
    var r=null;
    try{
      if(document.caretRangeFromPoint)r=document.caretRangeFromPoint(event.clientX,event.clientY);
      else if(document.caretPositionFromPoint){var p=document.caretPositionFromPoint(event.clientX,event.clientY);if(p){r=document.createRange();r.setStart(p.offsetNode,p.offset);r.collapse(true)}}
    }catch(e){}
    if(!r || !document.body.contains(r.startContainer))return null;
    return {node:r.startContainer,offset:r.startOffset};
  }
  function selectRange(){
    if(!anchor||!finish)return;
    try{
      var r=document.createRange();r.setStart(anchor.node,anchor.offset);r.setEnd(finish.node,finish.offset);
      if(r.collapsed){r.setStart(finish.node,finish.offset);r.setEnd(anchor.node,anchor.offset);}
      var selection=window.getSelection();selection.removeAllRanges();selection.addRange(r);
      lastSelectionRange=r.cloneRange();cached=selection.toString();
      message(cached?'範囲選択 '+cached.length+'文字 ✓ コピーを押してね':'選択範囲が空です。別の位置を指定してね');
    }catch(e){message('このページの指定場所は選択できません。通常の長押し操作を使ってね');}
  }
  function selectableElement(el){
    return el&&el.nodeType===1&&el.closest('input:not([type=password]),textarea,[contenteditable=true],[contenteditable=""]');
  }
  function intercept(event){
    if(!mode||host.contains(event.target)||event.composedPath&&event.composedPath().includes(host))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(mode==='pick'){
      var editable=selectableElement(event.target);
      if(!editable){message('貼付先は文字入力欄をタップしてね');return;}
      if(editable.closest('.monaco-editor')){message('コードエディタへの貼り付けは標準のペースト操作を使ってね');buttonMode('');return;}
      target=editable;target.focus();buttonMode('');message('貼付先を選んだよ。貼り付けを押してね');return;
    }
    var p=point(event);
    if(!p){message('ここは選択できません。文字の上をタップしてね');return;}
    if(mode==='start'){anchor=p;finish=null;buttonMode('');message('始点を設定したよ。続けて「終点指定」→文字をタップ');}
    else if(mode==='end'){if(!anchor){message('先に始点を指定してね');buttonMode('');return;}finish=p;buttonMode('');selectRange();}
  }
  document.addEventListener('click',intercept,true);listeners.push(['click',intercept,true]);
  $('start').onclick=function(){buttonMode('start');message('始点にしたい文字をタップしてね');};
  $('end').onclick=function(){buttonMode('end');message(anchor?'終点にしたい文字をタップしてね':'先に始点を指定してね');};
  $('pick').onclick=function(){buttonMode('pick');message('貼り付け先の入力欄をタップしてね');};
  $('all').onclick=function(){
    buttonMode('');var focus=document.activeElement;
    try{
      if(focus&&/^(TEXTAREA|INPUT)$/.test(focus.tagName)&&focus.type!=='password'){
        focus.focus();focus.select();cached=focus.value;message('入力欄 '+cached.length+'文字を全選択 ✓');return;
      }
      if(focus&&focus.isContentEditable){
        var er=document.createRange();er.selectNodeContents(focus);window.getSelection().removeAllRanges();window.getSelection().addRange(er);cached=window.getSelection().toString();message('編集中の文字 '+cached.length+'文字を全選択 ✓');return;
      }
      var chosen=document.querySelector('main')||document.querySelector('article')||document.body;
      var r=document.createRange();r.selectNodeContents(chosen);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);lastSelectionRange=r.cloneRange();cached=sel.toString();
      message('ページの文章 '+cached.length+'文字を選択 ✓\n※コードエディタは表示中の範囲だけの場合あり');
    }catch(e){message('全文選択できません。文字の上を長押ししてね');}
  };
  function fallback(text){
    var box=$('manual');box.style.display='block';box.value=text;
    try{box.focus();box.select();box.setSelectionRange(0,box.value.length);return !!document.execCommand('copy');}catch(e){return false;}
  }
  $('copy').onclick=async function(){
    var selected='';
    try{selected=window.getSelection().toString();}catch(e){}
    var focused=document.activeElement;
    if(focused&&/^(TEXTAREA|INPUT)$/.test(focused.tagName)&&focused!==$('manual')&&focused.type!=='password'&&focused.selectionStart<focused.selectionEnd)selected=focused.value.slice(focused.selectionStart,focused.selectionEnd);
    var text=selected||cached;
    if(!text){message('選択した文字がないよ。「全選択」か範囲指定を先にしてね');return;}
    var copied=false;
    try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);copied=true;}}catch(e){}
    if(!copied)copied=fallback(text);
    message(copied?'コピー成功 ✓ '+text.length+'文字':'iPhoneがコピーを制限したよ。下の欄を長押し→コピーしてね');
  };
  $('paste').onclick=async function(){
    if(!target){message('「貼付先」→入力欄をタップして指定してね');return;}
    var text='';
    try{if(navigator.clipboard&&navigator.clipboard.readText)text=await navigator.clipboard.readText();}catch(e){}
    if(!text){message('iPhoneの貼り付け許可が必要だよ。入力欄を長押し→「ペースト」を選んでね');target.focus();return;}
    if(target.isContentEditable){target.focus();document.execCommand('insertText',false,text);message('入力欄に貼り付けたよ ✓');return;}
    if(typeof target.setRangeText==='function'){
      var a=target.selectionStart,b=target.selectionEnd;target.setRangeText(text,a,b,'end');target.dispatchEvent(new Event('input',{bubbles:true}));message('入力欄に貼り付けたよ ✓');return;
    }
    message('この入力欄は標準のペースト操作を使ってね');
  };
  // Drag from the title, keeping buttons available on a phone.
  var dragging=null;
  $('head').addEventListener('pointerdown',function(e){if(e.target.closest('button'))return;dragging={x:e.clientX,y:e.clientY,r:panel.getBoundingClientRect()};try{$('head').setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();});
  $('head').addEventListener('pointermove',function(e){if(!dragging)return;var left=Math.max(0,Math.min(innerWidth-80,dragging.r.left+e.clientX-dragging.x));var top=Math.max(0,Math.min(innerHeight-50,dragging.r.top+e.clientY-dragging.y));panel.style.left=left+'px';panel.style.top=top+'px';panel.style.right='auto';panel.style.bottom='auto';});
  $('head').addEventListener('pointerup',function(){dragging=null;});
  message('準備OK！ページを見ながら始点・終点を選べるよ');
};