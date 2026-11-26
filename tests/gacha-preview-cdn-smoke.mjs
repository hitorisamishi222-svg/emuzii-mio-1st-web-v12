// Read-only, reviewed deployment smoke test. Run from the exact checkout.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {checkedOrigin,verifiedAsset} from './gacha-preview-guard.mjs';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(!process.env.GACHA_PREVIEW_ORIGIN || !process.env.GACHA_PREVIEW_METADATA_FILE)throw Error('PREVIEW_METADATA_REQUIRED: no fallback to old URL');
const proof=JSON.parse(readFileSync(process.env.GACHA_PREVIEW_METADATA_FILE,'utf8'));
const origin=checkedOrigin(process.env.GACHA_PREVIEW_ORIGIN,proof,sha);
const fixture=JSON.parse(readFileSync('gacha-prize-demo-catalog.json','utf8'));
assert.equal(fixture.prizes.length,27);
const assets=['/gacha.html','/gacha-deluxe-v21.css','/gacha-deluxe-v21.js','/assets/mio-undersea-palace-stage.svg','/gacha-prize-demo-catalog.json',...new Set(fixture.prizes.map(p=>p.image))];
const js=readFileSync('gacha-deluxe-v21.js','utf8');
assert.ok(js.includes('PREVIEW_SNAPSHOT')&&js.includes('mioPrizeClose'),'Reviewed checkout missing expected markers');
for(const path of assets){
  // path validation precedes local file access (fixture is not trusted blindly).
  if(!/^\/(?:gacha\.html|gacha-deluxe-v21\.(?:css|js)|gacha-prize-demo-catalog\.json|assets\/mio-undersea-palace-stage\.svg|gacha-(?:mem|lf)-\d{2}\.jpg)$/.test(path))throw Error('STATIC_ASSET_ONLY');
  const result=await verifiedAsset({origin,path,localBytes:readFileSync('.'+path),secret:process.env.VERCEL_AUTOMATION_BYPASS_SECRET});
  console.log('ASSET_OK',result.path,result.bytes,result.sha256);
}
console.log('PASS: reviewed preview assets match checkout; no live API touched.');
