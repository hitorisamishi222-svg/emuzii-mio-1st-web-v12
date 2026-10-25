/**
 * MIO gacha deluxe — source-level safety contract (read-only).
 *
 * Run: node --test tests/gacha-deluxe-safety.test.mjs
 * This verifies checked-in source only. It does NOT run Apps Script,
 * consume gacha rights, contact the live API, or assert release readiness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = source('gacha.html');
const deluxe = source('gacha-deluxe-v21.js');
const page = source('gacha-page.js');
const api = source('api-gacha.js');
const vercel = JSON.parse(source('vercel.json'));
const builds = new Set((vercel.builds || []).map(x => x.src));

const checks = [
  ['HTML loads deluxe assets', () => html.includes('href="/gacha-deluxe-v21.css"') && html.includes('src="/gacha-deluxe-v21.js"')],
  ['Deluxe assets are declared as Vercel static builds', () => builds.has('gacha-deluxe-v21.js') && builds.has('gacha-deluxe-v21.css')],
  ['Deluxe UI does not call draw API', () => !/\/api\/gacha|fetch\(|\.appendRow\(|bridge\(/.test(deluxe)],
  ['Deluxe UI does not mutate local storage', () => !/localStorage\.(setItem|removeItem)/.test(deluxe)],
  ['Visual demo requires explicit query flag', () => deluxe.includes("get('deluxeDemo')!=='1'")],
  ['Visual demo is hostname-gated', () => deluxe.includes('if(!previewHost||')],
  ['Visual demo disables regular draw controls', () => deluxe.includes("controls.querySelectorAll('button')") && deluxe.includes('button.disabled=true')],
  ['Visual demo is visibly labeled no-draw', () => deluxe.includes('抽選・当選はしていません')],
  ['Visual demo covers normal and festival modes', () => deluxe.includes("run('通常')") && deluxe.includes("run('ラキフェス')")],
  ['Non-production host cannot request live draw in page script', () => page.includes('if(isPreview)') && page.includes('テスト版では実抽選できません')],
  ['Live page reads both admin gate flags', () => page.includes('normalOpen=c.normalOpen===true') && page.includes('festOpen=c.festOpen===true')],
  ['Draw API validates 32-character draw ID', () => api.includes('^[a-f0-9]{32}$')],
  ['Draw API requires a signed session', () => api.includes('if(!session)return res.status(401)')],
  ['Page retains drawId for retry', () => page.includes('pendingKey()') && page.includes('setItem(pendingKey()')],
  ['Page refreshes current catalog before initiating draw', () => page.includes('await loadCatalog(false)')],
  ['Visual UI receives result and failure lifecycle events', () => deluxe.includes('mio:gacha-result-shown') && deluxe.includes('mio:gacha-animation-error')]
];

for (const [name, condition] of checks) {
  test('gacha source contract: ' + name, () => assert.equal(condition(), true));
}
