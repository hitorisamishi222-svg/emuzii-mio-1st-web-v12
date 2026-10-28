import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const fixture=JSON.parse(readFileSync(new URL('../gacha-prize-demo-catalog.json',import.meta.url),'utf8'));
const js=readFileSync(new URL('../gacha-deluxe-v21.js',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

test('snapshot holds exactly 27 eligible prizes with mode-specific 100% original odds',()=>{
  assert.equal(fixture.prizes.length,27);
  for(const [mode,count,prefix] of [['通常',16,'MEM'],['ラキフェス',11,'LF']]){
    const list=fixture.prizes.filter(p=>p.mode===mode);
    assert.equal(list.length,count);
    assert.equal(Math.round(list.reduce((n,p)=>n+p.odds,0)*100),10000);
    assert.equal(new Set(list.map(x=>x.id)).size,count);
    for(const item of list){
      assert.match(item.id,new RegExp('^'+prefix+'-\\d{2}$'));
      assert.ok(item.name.trim());
      assert.ok(['N','R','SR','UR'].includes(item.rarity));
      assert.ok(item.odds>0);
      assert.equal(item.image,'/gacha-'+(mode==='通常'?'mem':'lf')+'-'+item.id.slice(-2).toLowerCase()+'.jpg');
    }
  }
});

test('every configured prize image is included in the deployment and is a real JPEG',()=>{
  const built=new Set(config.builds.map(x=>x.src));
  for(const p of fixture.prizes){
    const relative=p.image.slice(1);
    assert.ok(built.has(relative),relative+' is missing from vercel.json');
    const bytes=readFileSync(new URL('../'+relative,import.meta.url));
    assert.ok(bytes.length>=64,relative+' appears missing/truncated');
    assert.equal(bytes[0],0xff,relative+' lacks JPEG header');
    assert.equal(bytes[1],0xd8,relative+' lacks JPEG header');
    assert.equal(bytes[2],0xff,relative+' lacks JPEG header');
  }
  assert.ok(built.has('gacha-prize-demo-catalog.json'));
});

test('cross-mode shared prize names remain separate entries but can be deduplicated per participant',()=>{
  const normal=new Set(fixture.prizes.filter(p=>p.mode==='通常').map(p=>p.name));
  const fest=fixture.prizes.filter(p=>p.mode==='ラキフェス');
  const common=fest.filter(p=>normal.has(p.name));
  assert.equal(common.length,7);
  assert.equal(new Set(fixture.prizes.map(p=>p.name)).size,20);
});

test('luxury rehearsal draws zero prizes and reads only its static local fixture',()=>{
  const preview=js.slice(js.indexOf('// Preview-only interaction.'));
  assert.match(preview,/previewHost/);
  assert.match(preview,/deluxeDemo/);
  assert.match(preview,/fetch\('\/gacha-prize-demo-catalog\.json'/);
  assert.match(preview,/name\.textContent=prize\.name/);
  assert.match(preview,/image\.src=prize\.image/);
  assert.match(preview,/rarity=prize\.rarity/);
  assert.doesNotMatch(preview,/fetch\(['"]\/api\//);
  assert.doesNotMatch(preview,/action\s*:\s*['"]draw['"]/);
  assert.doesNotMatch(preview,/localStorage\.setItem/);
});

test('iPhone image sizing retains original whale canvas and landscape prize proportions',()=>{
  const css=readFileSync(new URL('../gacha-deluxe-v21.css',import.meta.url),'utf8');
  assert.match(css,/v2\.1\.6 — iPhone visual inspection/);
  const patch=css.slice(css.indexOf('/* v2.1.6 — iPhone visual inspection'));
  assert.match(patch,/aspect-ratio:1 \/ 1!important/,'original whale artwork is square');
  assert.match(patch,/#drawResultImage:not\(\[hidden\]\)/);
  assert.match(patch,/width:100%!important/,'prize image should use available card width');
  assert.match(patch,/height:auto!important/,'prize image keeps native ratio');
  assert.match(patch,/object-fit:contain!important/);
  // Image geometry is intentional: LF-18 is a wide ticket (535x220), while
  // the background art is square (900x900). Neither must be distorted.
  const jpegDimensions=filename=>{
    const bytes=readFileSync(new URL('../'+filename,import.meta.url));
    let i=2;
    while(i+9<bytes.length){
      if(bytes[i++]!==0xff)continue;
      while(bytes[i]===0xff)i++;
      const marker=bytes[i++];
      if(marker===0xd9||marker===0xda)break;
      const len=bytes.readUInt16BE(i);
      if([0xc0,0xc1,0xc2,0xc3].includes(marker))
        return [bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];
      if(len<2)break;
      i+=len;
    }
    throw Error('JPEG dimensions unavailable: '+filename);
  };
  assert.deepEqual(jpegDimensions('gacha-lf-18.jpg'),[535,220]);
  assert.deepEqual(jpegDimensions('assets/mio-royal-whale-machine.jpg'),[900,900]);
});

test('preview buttons are immediately before machine, scrolling into view on a demo tap',()=>{
  assert.match(js,/stage\.insertAdjacentElement\('beforebegin',demo\)/);
  assert.match(js,/stage\.scrollIntoView\?\.\(\{behavior:reducedMotion\?'auto':'smooth',block:'center'\}\)/);
  assert.doesNotMatch(js,/foot\.insertAdjacentElement\('afterend',demo\)/);
  const page=readFileSync(new URL('../gacha-page.js',import.meta.url),'utf8');
  assert.match(page,/\$\('gachaStage'\)\.scrollIntoView\?\.\(\{behavior:reduceMotion\?'auto':'smooth',block:'center'\}\)/,
    'confirmed real draws need the same visibility handling');
});
