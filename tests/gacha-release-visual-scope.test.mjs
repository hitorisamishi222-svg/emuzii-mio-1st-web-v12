import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
const text=name=>readFileSync(new URL(name,root),'utf8');
const gitBlobSha=name=>{
  const buffer=readFileSync(new URL(name,root));
  return createHash('sha1').update(Buffer.from('blob '+buffer.length+'\0')).update(buffer).digest('hex');
};

test('visual-only and main-based candidates each preserve their own EXACT verified production GAS, bridge and draw API blobs',()=>{
  // Historical visual-only release remains pinned to its original SHA list.
  // Never silently change those historical expectations to make a new branch pass.
  const legacyVisualOnlyExpected=new Map([
    ['APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs','6dd7e5fc938fb0150c5067760f37972613f3075b'],
    ['api-gacha.js','8ecaad8f735119145bec1823f3bb27dc8224f4a7'],
    ['bridge.js','b3311e007eb94c40e11d8d64faca68061e7266ba'],
    ['api-status.js','5b390d05edf1bf9e8cbb008c38838cbb3573517f']
  ]);
  const mainManifestUrl=new URL('tests/fixtures/mio-protected-main-baseline-20261102.json',root);
  const isMainBased=existsSync(mainManifestUrl);
  let expected=legacyVisualOnlyExpected;
  if(isMainBased){
    // Main-based integration starts from the verified PRODUCTION commit, not the
    // older four-asset luxury visual-only candidate. Preserve BOTH immutable gates.
    const manifest=JSON.parse(readFileSync(mainManifestUrl,'utf8'));
    assert.equal(manifest.baselineCommit,'bb4a39a29e6c5c3ae70b6c35cf290feb8cb67a6b',
      'Stop if the production baseline advances before approval');
    const mainBasedExpected=new Map([
      ['APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs','6dd7e5fc938fb0150c5067760f37972613f3075b'],
      ['api-gacha.js','8ecaad8f735119145bec1823f3bb27dc8224f4a7'],
      ['bridge.js','b3311e007eb94c40e11d8d64faca68061e7266ba'],
      ['api-status.js','92193c59bdb97d96a7fcb94e9b2e7edd5867c0f1']
    ]);
    assert.equal(Object.keys(manifest.productionFileBlobs).length,20,
      'All original participant and GAS artifacts must remain pinned');
    for(const [filename,hash] of mainBasedExpected){
      assert.equal(manifest.productionFileBlobs[filename],hash,
        filename+' has a mismatched immutable production manifest');
    }
    expected=mainBasedExpected;
  }
  for(const [filename,hash] of expected){
    assert.equal(gitBlobSha(filename),hash,
      filename+' must remain byte-identical to its explicitly approved baseline');
  }
});

test('presentation-only page retains baseline draw endpoint without new GAS contract',()=>{
  const page=text('gacha-page.js');
  assert.match(page,/post\('\/api\/gacha',\{action:'draw',\.\.\.pending\}\)/);
  assert.match(page,/async function execute\(pending\)/);
  assert.doesNotMatch(page,/from ['"]\.\/gacha-contract\.js['"]/);
  assert.doesNotMatch(page,/action:'recover'/);
  assert.doesNotMatch(page,/scrollIntoView/);
  assert.match(page,/if\(!\$\('drawResultCard'\)\.hidden\)/);
  assert.match(page,/mio:gacha-prize-closed/);
});

test('release includes only its four static additions and retains active API routes',()=>{
  const config=JSON.parse(text('vercel.json'));
  const assets=['gacha-deluxe-v21.css','gacha-deluxe-v21.js',
    'gacha-prize-demo-catalog.json','assets/mio-undersea-palace-stage.svg'];
  for(const name of assets)assert.ok(config.builds.some(x=>x.src===name&&x.use==='@vercel/static'),name);
  assert.equal(config.builds.some(x=>x.src==='gacha-contract.js'),false);
  assert.equal(config.builds.some(x=>x.src==='gacha-draw-preflight.js'),false);
  assert.equal(config.builds.some(x=>x.src==='gacha-recorded-replay.js'),false);
  assert.ok(config.routes.some(x=>x.src==='/api/gacha'));
  assert.ok(config.routes.some(x=>x.src==='/api/status'));
});

test('luxury v2.1 is loaded by presentation page, while real operation stays protected',()=>{
  const html=text('gacha.html');
  assert.match(html,/href="\/gacha-deluxe-v21\.css"/);
  assert.match(html,/src="\/gacha-deluxe-v21\.js"/);
  assert.match(html,/src="\/gacha-page\.js(?:\?[^\"]*)?"/);
  assert.match(html,/src="\/gacha-effects-v19\.js"/);
  const demo=text('gacha-deluxe-v21.js');
  assert.match(demo,/new URLSearchParams\(location\.search\)\.get\('deluxeDemo'\)!=='1'/);
  assert.match(demo,/previewHost/);
  assert.doesNotMatch(demo,/fetch\(['"]\/api\/gacha/);
});
