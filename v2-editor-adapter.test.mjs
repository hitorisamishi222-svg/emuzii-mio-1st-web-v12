import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./asahi-panel-v3.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map(),selection={removeAllRanges(){},addRange(){},toString(){return ''}};
 function el(id){if(!nodes.has(id))nodes.set(id,{id,style:{},textContent:'',classList:{toggle(){}},addEventListener(){},focus(){},select(){},setSelectionRange(){},closest(){return null},getBoundingClientRect(){return {left:20,top:20}}});return nodes.get(id);}
 const shadow={innerHTML:'',getElementById:el};
 const host={attachShadow(){return shadow},contains(){return false},remove(){}};
 const document={createElement(){return host},documentElement:{appendChild(){}},body:{contains(){return true}},addEventListener(){},removeEventListener(){},querySelector(){return null},createRange(){return {selectNodeContents(){},cloneRange(){return this}}},activeElement:null};
 const calls={selections:[],position:{lineNumber:3,column:4}};
 const model={
  getValue(){return 'abc\nxyz\nend'},
  getFullModelRange(){return {startLineNumber:1,startColumn:1,endLineNumber:3,endColumn:4}},
  getValueInRange(r){return JSON.stringify(r)}
 };
 const editor={getModel(){return model},getPosition(){return calls.position},setSelection(r){calls.selections.push(r)},hasTextFocus(){return true}};
 const window={getSelection(){return selection},monaco:{editor:{getEditors(){return [editor]}}}};
 const clipboard=[];
 const navigator={clipboard:{async writeText(s){clipboard.push(s)}}};
 runInNewContext(source,{window,document,navigator,Range:{START_TO_START:0}},{timeout:1000});
 window.AsahiPanelInstall();
 return {nodes,el,calls,clipboard,window};
}
test('Monaco full code selection reads full model, not virtualized DOM',async()=>{
 const f=fixture();
 f.el('all').onclick();
 assert.match(f.el('msg').textContent,/コード全文 11文字/);
 await f.el('copy').onclick();
 assert.equal(f.clipboard.at(-1),'abc\nxyz\nend');
 assert.equal(f.calls.selections.length,1);
});
test('Monaco start/end coordinates support reversed positions',async()=>{
 const f=fixture();
 f.calls.position={lineNumber:3,column:4};
 f.el('start').onclick();
 f.calls.position={lineNumber:1,column:2};
 f.el('end').onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls.selections.at(-1))),{startLineNumber:1,startColumn:2,endLineNumber:3,endColumn:4});
 await f.el('copy').onclick();
 assert.match(f.clipboard.at(-1),/"startLineNumber":1/);
});
