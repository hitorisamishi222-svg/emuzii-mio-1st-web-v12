import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../gacha-deluxe-v21.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../gacha-prize-demo-catalog.json',import.meta.url),'utf8'));

function runOverlay(host='production') {
  const nodes=[],listeners=new Map(),network=[],scrolls=[],timers=new Map();
  let time=0,number=0;
  class FakeElement {
    constructor(tag='div',id=''){
      this.tag=tag;this.id=id;this.parentNode=null;this.children=[];
      this.dataset={};this.hidden=false;this.attributes={};this.style={};
      this._classes=new Set();this._value=undefined;this.textContent='';
      this._handlers=new Map();nodes.push(this);
      this.classList={
        add:(...x)=>x.forEach(k=>this._classes.add(k)),
        remove:(...x)=>x.forEach(k=>this._classes.delete(k)),
        contains:x=>this._classes.has(x),
        toggle:(x,force)=>{
          const on=force===undefined?!this._classes.has(x):!!force;
          on?this._classes.add(x):this._classes.delete(x);return on;
        }
      };
    }
    set className(text){this._classes=new Set(String(text).split(/\s+/).filter(Boolean))}
    get className(){return [...this._classes].join(' ')}
    set value(v){this._value=v}
    get value(){return this._value===undefined?(this.children[0]?.value||''):this._value}
    get lastElementChild(){return this.children.at(-1)}
    addEventListener(type,handler){this._handlers.set(type,handler)}
    click(){this._handlers.get('click')?.({target:this})}
    focus(opts){this.focusOptions=opts}
    scrollIntoView(opts){scrolls.push(opts)}
    setAttribute(k,v){this.attributes[k]=String(v)}
    removeAttribute(k){delete this.attributes[k]}
    append(...elements){elements.forEach(el=>this.insertBefore(el,null))}
    prepend(...elements){elements.reverse().forEach(el=>this.insertBefore(el,this.children[0]||null))}
    replaceChildren(...elements){this.children.forEach(x=>x.parentNode=null);this.children=[];this._value=undefined;this.append(...elements)}
    insertBefore(el,before){
      if(el.parentNode)el.parentNode.children.splice(el.parentNode.children.indexOf(el),1);
      const index=before?this.children.indexOf(before):-1;
      this.children.splice(index<0?this.children.length:index,0,el);
      el.parentNode=this;
      return el;
    }
    insertAdjacentElement(where,el){
      if(where==='beforebegin')this.parentNode.insertBefore(el,this);
      else if(where==='afterend'){
        const list=this.parentNode.children;
        this.parentNode.insertBefore(el,list[list.indexOf(this)+1]||null);
      }else throw Error('Unsupported insertion '+where);
    }
    querySelector(selector){
      if(selector==='.royal-gacha-controls')return this.find(x=>x.classList.contains('royal-gacha-controls'));
      if(selector[0]==='#')return this.find(x=>x.id===selector.slice(1));
      return this.find(x=>x.tag===selector);
    }
    querySelectorAll(selector){
      const matches=[];
      const visit=e=>{for(const node of e.children){if(node.tag===selector)matches.push(node);visit(node)}};
      visit(this);return matches;
    }
    find(predicate){
      if(predicate(this))return this;
      for(const x of this.children){const found=x.find(predicate);if(found)return found}
      return null;
    }
  }
  const panel=new FakeElement('section','drawPanel');
  const remaining=new FakeElement('p','drawRemaining');panel.append(remaining);
  const controls=new FakeElement('div');controls.classList.add('royal-gacha-controls');
  controls.append(new FakeElement('button','drawNormal'),new FakeElement('button','drawFest'));panel.append(controls);
  const stage=new FakeElement('div','gachaStage');panel.append(stage);
  const result=new FakeElement('section','drawResultCard');result.hidden=true;
  for(const [tag,id] of [['img','drawResultImage'],['span','drawRarity'],['strong','drawPrizeName'],['span','drawOrdinal']]){
    const n=new FakeElement(tag,id);if(tag==='img')n.hidden=true;result.append(n);
  }
  stage.append(result);
  const elements={panel,stage,controls,result};
  const windowObj={
    addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)},
    dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e)},
    matchMedia:()=>({matches:false})
  };
  const fetch=async (url)=>{
    network.push(url);
    if(url!=='/gacha-prize-demo-catalog.json')throw Error('Unexpected API call: '+url);
    return {ok:true,json:async()=>catalog};
  };
  const setTimeoutLocal=(fn,delay)=>{const id=++number;timers.set(id,{time:time+delay,fn});return id};
  const clearTimeoutLocal=id=>timers.delete(id);
  const isPreview=host==='preview';
  const ctx=vm.createContext({
    document:{
      getElementById:id=>panel.find(x=>x.id===id),
      createElement:tag=>new FakeElement(tag)
    },
    window:windowObj,
    location:{hostname:isPreview?'emuzii-mio-1st-web-v12-test123.vercel.app':'emuzii-mio-1st-web-v12.vercel.app',search:isPreview?'?deluxeDemo=1':''},
    URLSearchParams,
    MutationObserver:class{observe(){}disconnect(){}},
    fetch,setTimeout:setTimeoutLocal,clearTimeout:clearTimeoutLocal,
    Event:class{constructor(type){this.type=type}}
  });
  vm.runInContext(script,ctx,{filename:'gacha-deluxe-v21.js'});
  function advance(ms){
    const end=time+ms;
    for(let i=0;i<1000;i++){
      const due=[...timers].filter(([,v])=>v.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];
      if(!due)break;
      time=due[1].time;timers.delete(due[0]);due[1].fn();
      if(i===999)throw Error('Unexpected timer loop');
    }
    time=end;
  }
  function event(type,detail){windowObj.dispatchEvent({type,detail})}
  return {elements,advance,event,network,scrolls,find:id=>panel.find(x=>x.id===id)};
}

test('real prize appears in front of machine after capsule, closes, and opens again in same spot',()=>{
  const h=runOverlay();
  const {stage,result,controls}=h.elements;
  assert.equal(result.parentNode,stage);
  assert.equal(result.classList.contains('mio-prize-overlay'),true);
  assert.equal(controls.parentNode.children.indexOf(controls)+1,
    controls.parentNode.children.indexOf(stage),'buttons stay immediately above machine');
  result.hidden=false;
  h.event('mio:gacha-result-shown',{rarity:'UR',mode:'ラキフェス'});
  h.advance(1549);
  assert.equal(stage.classList.contains('mio-prize-open'),false,'wait for the UR capsule');
  h.advance(1);
  assert.equal(stage.classList.contains('mio-prize-open'),true);
  assert.deepEqual(h.scrolls,[]);
  const close=h.find('mioPrizeClose');
  assert.ok(close);
  assert.equal(close.focusOptions.preventScroll,true);
  close.click();
  assert.equal(result.hidden,true);
  assert.equal(stage.classList.contains('mio-prize-open'),false);
  assert.equal(result.parentNode,stage);
  result.hidden=false;
  h.event('mio:gacha-result-shown',{rarity:'N',mode:'通常'});
  h.advance(320);
  assert.equal(stage.classList.contains('mio-prize-open'),true,'second prize appears over same machine');
  assert.equal(result.parentNode,stage);
  assert.equal(h.scrolls.length,0);
});

test('preview uses actual prize record, requires close before second spin, never contacts draw API',async()=>{
  const h=runOverlay('preview');
  for(let i=0;i<6;i++)await Promise.resolve();
  const {stage,result}=h.elements;
  const demo=stage.parentNode.find(x=>x.classList.contains('mio-deluxe-demo'));
  assert.ok(demo);
  const normal=demo.querySelectorAll('button')[0],fest=demo.querySelectorAll('button')[1];
  assert.equal(normal.disabled,false,'27 prize catalog was loaded');
  normal.click();
  assert.equal(normal.disabled,true);
  h.advance(5000);
  assert.equal(result.hidden,false);
  assert.equal(h.find('drawPrizeName').textContent,catalog.prizes[0].name);
  assert.equal(stage.classList.contains('mio-prize-open'),false,'capsule exit precedes item');
  h.advance(220);
  assert.equal(stage.classList.contains('mio-prize-open'),true);
  assert.equal(normal.disabled,true,'cannot spin again until prize closed');
  assert.deepEqual(h.scrolls,[]);
  h.find('mioPrizeClose').click();
  assert.equal(result.hidden,true);
  assert.equal(normal.disabled,false,'close restores next-spin control without moving page');
  fest.click();
  h.advance(5220);
  assert.equal(stage.classList.contains('mio-prize-open'),true);
  assert.equal(h.find('drawPrizeName').textContent,catalog.prizes.find(p=>p.mode==='ラキフェス').name);
  assert.equal(result.parentNode,stage);
  assert.deepEqual(h.network,['/gacha-prize-demo-catalog.json']);
  assert.deepEqual(h.scrolls,[]);
});

test('prize modal displays only saved results; close cannot initiate or reroll a draw',()=>{
  const h=runOverlay();
  const {result}=h.elements;
  result.hidden=false;
  h.event('mio:gacha-result-shown',{rarity:'R',mode:'通常'});
  h.advance(520);
  h.find('mioPrizeClose').click();
  assert.deepEqual(h.network,[]);
  assert.equal(result.hidden,true);
});
