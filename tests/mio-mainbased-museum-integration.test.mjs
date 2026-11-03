import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {approvedGalleryItems} from '../gallery-items.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>existsSync(new URL('../'+p,import.meta.url));
const config=JSON.parse(read('vercel.json'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const baseline=JSON.parse(read('tests/fixtures/mio-protected-main-baseline-20261102.json'));
const shaOfFile=path=>{
 const bytes=readFileSync(new URL('../'+path,import.meta.url));
 return createHash('sha1').update('blob '+bytes.length).update(Buffer.from([0])).update(bytes).digest('hex');
};
const hasMainRef=()=>{try{git('rev-parse','--verify','origin/main');return true}catch{return false}};

const media={
 song:'/mio-awakening.mp3',
 video:'https://vt.tiktok.com/ZSgFvmy7Q/',
 cover:'/assets/gallery-emuzii-mio-cover.svg'
};
const museumPages=['museum.html','mio-profile.html','museum-archive.html','museum-approved-gallery.html','museum-device-check.html'];
const museumFiles=[...museumPages,'museum.css','museum-archive.css','museum-archive.js','museum-news.js','museum-approved-gallery.js','museum-media-fallback.js','museum-image-client.js','museum-device-check.js'];
const rehearsalFiles=['mio-admin-rehearsal.html','mio-admin-rehearsal.js'];
const gasLocalFiles=['mio-gas-local-check.html','mio-gas-local-check.js'];
const stagedAssets=[...museumFiles,...rehearsalFiles,...gasLocalFiles];
const unchanged=[
 'index.html','app.js','style.css','bridge.js',
 'api-register.js','api-status.js','api-checkin.js',
 'api-gacha.js','gacha-page.js','gacha.html',
 'api-gacha-admin-ops.js',
 'APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs',
 'api-gallery-items.js','api-gallery-manage.js','api-gallery-moderate.js',
 'gallery.html','gallery-items.js','mio-awakening.mp3',
 'assets/gallery-emuzii-mio-cover.svg'
];

test('all old production authentication, draw, attendance and approved media blobs are byte-identical to origin/main',()=>{
 // This is a structural check of the protected source, not live GAS/DB validation.
 assert.equal(baseline.baselineCommit,'bb4a39a29e6c5c3ae70b6c35cf290feb8cb67a6b');
 assert.equal(Object.keys(baseline.productionFileBlobs).length,unchanged.length+1);
 for(const path of unchanged){
  assert.equal(shaOfFile(path),baseline.productionFileBlobs[path],
   'PROTECTED MAIN FILE CHANGED: '+path);
 }
 // Also protect against main advancing after the snapshot when a remote ref is present.
 if(hasMainRef()){
  assert.equal(git('rev-parse','origin/main'),baseline.baselineCommit,
    'main changed since staging baseline; refresh under review before release');
  for(const path of unchanged){
   assert.equal(git('rev-parse','HEAD:'+path),git('rev-parse','origin/main:'+path),
     'Protected main file differs from live baseline: '+path);
  }
 }
});
test('existing live gacha gate remains exactly the original code after removing the marked disabled admin preview',()=>{
 const html=read('gacha-web-gate.html');
 const start='<!-- MIO_ADMIN_PREVIEW_START -->';
 const end='<!-- MIO_ADMIN_PREVIEW_END -->';
 assert.equal(html.split(start).length,2);
 assert.equal(html.split(end).length,2);
 const original=html.replace(/<!-- MIO_ADMIN_PREVIEW_START -->[\s\S]*?<!-- MIO_ADMIN_PREVIEW_END -->\n/,'');
 const buffer=Buffer.from(original,'utf8');
 const restoredSha=createHash('sha1').update('blob '+buffer.length)
  .update(Buffer.from([0])).update(buffer).digest('hex');
 assert.equal(restoredSha,baseline.productionFileBlobs['gacha-web-gate.html'],
  'Original gacha switches, passkeys, and API calls must remain byte identical');
 const panel=html.slice(html.indexOf(start),html.indexOf(end));
 for(const id of ['opsPending','opsRoster','opsGrant','opsSimple','opsCount','opsStatus','opsReload','opsSearch','opsQuantity','opsReason','opsIntakeCreate']){
  assert.equal(html.split('id="'+id+'"').length-1,1,'Missing/duplicate admin control '+id);
 }
 for(const id of ['opsReload','opsGrant','opsIntakeCreate','opsSearch','opsQuantity','opsReason','opsNewName','opsNewNote']){
  assert.match(panel,new RegExp('<(?:button|input)[^>]*id="'+id+'"[^>]*\\bdisabled\\b'));
 }
 assert.doesNotMatch(panel,/fetch\s*\(|<script|onclick\s*=|onchange\s*=|document\.cookie|localStorage|sessionStorage/);
 assert.doesNotMatch(html,new RegExp('<script[^>]*src="/gacha-admin-ops[.]js"'),
  'Do not activate admin actions until deployed GAS is verified');
});
test('all prior Vercel builds and routes are retained EXACTLY, in the same order',()=>{
 const filteredBuilds=config.builds.filter(x=>baseline.builds.some(y=>y.src===x.src));
 const filteredRoutes=config.routes.filter(x=>baseline.routes.some(y=>y.src===x.src));
 assert.deepEqual(filteredBuilds,baseline.builds,'A production build was removed/modified/reordered');
 assert.deepEqual(filteredRoutes,baseline.routes,'A production route was removed/modified/reordered');
 assert.equal(config.builds.length,baseline.builds.length+stagedAssets.length);
 assert.equal(config.routes.length,baseline.routes.length+stagedAssets.length);
});
test('museum routes are exact static files only; no production auth or database endpoints are added',()=>{
 for(const path of stagedAssets){
  assert.ok(exists(path),'Missing '+path);
  assert.deepEqual(config.builds.filter(x=>x.src===path),[{src:path,use:'@vercel/static'}]);
  const route=config.routes.filter(x=>x.src==='/'+path);
  assert.equal(route.length,1,path);
  assert.equal(route[0].dest,'/'+path);
  if(path.endsWith('.html'))assert.equal(route[0].headers['X-Robots-Tag'],'noindex, nofollow');
 }
 assert.equal(config.routes.filter(x=>x.src.startsWith('/api/museum')).length,0);
 for(const path of ['api-museum-exhibits.js','api-museum-image.js','api-museum-preflight.js'])
  assert.equal(exists(path),false,'Never stage unverified database writes: '+path);
});
test('admin rehearsal is a static, noindex fictional-data-only route with no live API handlers',()=>{
 const html=read('mio-admin-rehearsal.html');
 const js=read('mio-admin-rehearsal.js');
 const panel=read('gacha-web-gate.html');
 assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
 assert.match(html,/架空データ/);
 assert.match(html,/実参加者に反映されません/);
 assert.match(panel,/href="\/mio-admin-rehearsal.html"/);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|sessionStorage|indexedDB|\binnerHTML\s*=/);
 assert.doesNotMatch(js,/\/api\/|BRIDGE_SECRET|process\.env|postgres|@vercel\/blob/);
 assert.match(js,/s\.ops\.has\(op\)/);
 const htmlRoute=config.routes.find(x=>x.src==='/mio-admin-rehearsal.html');
 assert.equal(htmlRoute.headers['X-Robots-Tag'],'noindex, nofollow');
 assert.equal(htmlRoute.headers['Cache-Control'],'private, no-store');
});
test('mobile GAS source inspector is offline-only, non-indexed, never grants release, and never shows private sources',()=>{
 const page=read('mio-gas-local-check.html'),script=read('mio-gas-local-check.js');
 const entry=read('gacha-web-gate.html');
 assert.match(entry,/href="\/mio-gas-local-check.html"/);
 assert.match(page,/<meta name="robots" content="noindex,nofollow">/);
 assert.match(page,/端末内だけの検査/);
 assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|sessionStorage|indexedDB|\binnerHTML\s*=|\beval\s*\(/);
 assert.doesNotMatch(script,/\/api\/|ScriptApp|SpreadsheetApp|google\.script\.run/);
 assert.match(script,/liveAdminWriteAllowed:false/);
 assert.match(script,/deployedVersionVerified:false/);
 assert.match(script,/DEPLOYED_GAS_VERSION_AND_BACKUP_NOT_VERIFIED/);
 assert.match(script,/pick\.value=''/);
 assert.deepEqual(config.routes.find(x=>x.src==='/mio-gas-local-check.html').headers,
  {'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'});
});
test('GAS backup verifier compares bytes only in browser and cannot certify deployment',()=>{
 const page=read('mio-gas-local-check.html'),js=read('mio-gas-local-check.js');
 for(const id of ['gasBackupOriginal','gasBackupCopy','gasBackupCompare','gasBackupClear','gasBackupStatus']){
  assert.match(page,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/window\.crypto\.subtle\.digest\('SHA-256'/);
 assert.match(js,/file\.arrayBuffer\(\)/);
 assert.match(js,/backupRevision\+\+/);
 assert.match(page,/稼働中のGASデプロイ版と一致する証明にはなりません/);
 assert.match(js,/deployedVersionVerified:false/);
 assert.match(js,/sourceBackupVerified:false/);
 assert.match(js,/liveAdminWriteAllowed:false/);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|sessionStorage|indexedDB/);
});
test('original approved video and audio remain visible in the static catalog with no session rights changed',()=>{
 const video=approvedGalleryItems.find(x=>x.id==='mio-awakening-video');
 const song=approvedGalleryItems.find(x=>x.id==='mio-awakening-song');
 assert.equal(song?.hidden,false);
 assert.equal(video?.hidden,false);
 assert.equal(song.audio,media.song);
 assert.equal(video.url,media.video);
 assert.equal(video.thumbnail,media.cover);
 const museum=read('museum.html');
 assert.match(museum,/<audio[^>]*controls[^>]*src="\/mio-awakening\.mp3"/);
 assert.ok(museum.includes('href="'+media.video+'"'));
 assert.ok(museum.includes('src="'+media.cover+'"'));
});
test('staging museum is non-indexed and not falsely described as production',()=>{
 for(const path of museumPages){
  const html=read(path);
  assert.match(html,/<meta name="robots" content="noindex,nofollow">/,path);
  assert.match(html,/大型アップデート用/,path);
  assert.doesNotMatch(html,/href="\/home-portrait-next\.html"|href="\/community-demo\.html"|href="\/home-updates-demo\.html"/,path);
 }
});
test('museum display JavaScript cannot read participants or submit writes',()=>{
 for(const path of ['museum-archive.js','museum-news.js','museum-approved-gallery.js','museum-media-fallback.js','museum-image-client.js','museum-device-check.js']){
  const script=read(path);
  assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|sessionStorage|\bindexedDB\b/,path);
  assert.doesNotMatch(script,/\/api\/(?:register|gacha|status|checkin|gallery)/,path);
  assert.doesNotMatch(script,/innerHTML\s*=/,path);
 }
});
test('static approved-work view rejects hidden works and renders existing track/link without unsafe HTML',()=>{
 const original=read('museum-approved-gallery.js');
 const code=original.replace(/^import \{approvedGalleryItems\} from ['"]\.\/gallery-items\.js['"];?\s*$/m,'');
 assert.notEqual(code,original);
 const nodes=[];
 const node=tag=>{const a={tag,children:[],textContent:'',src:'',href:'',attrs:{},
  append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x},
  setAttribute(k,v){this.attrs[k]=v}};nodes.push(a);return a;};
 const list=node('section'),status=node('div');
 const document={createElement:node,getElementById(id){return id==='approvedGalleryItems'?list:id==='approvedGalleryStatus'?status:null}};
 const hidden={id:'x',title:'未公開作品',hidden:true,category:'動画',url:'https://example.com'};
 vm.runInNewContext(code,{document,URL,approvedGalleryItems:[...approvedGalleryItems,hidden]});
 assert.equal(list.children.length,2);
 assert.equal(nodes.filter(x=>x.tag==='audio')[0].src,media.song);
 assert.equal(nodes.filter(x=>x.tag==='a')[0].href,media.video);
 assert.equal(nodes.filter(x=>x.textContent==='未公開作品').length,0);
});
test('museum large update is gallery-first, hides attendance navigation without deleting legacy assets and defers chat',()=>{
 const top=read('museum.html');
 assert.ok(top.indexOf('id="exhibits"')>0);
 assert.ok(top.indexOf('id="exhibits"')<top.indexOf('id="mioAwakening"'));
 assert.ok(top.indexOf('id="exhibits"')<top.indexOf('id="latest"'));
 assert.match(top,/museum-featured-gallery/);
 assert.match(read('museum.css'),/museum-gallery-first/);
 for(const path of ['museum.html','mio-profile.html','museum-approved-gallery.html','museum-archive.html']){
  const page=read(path);
  assert.doesNotMatch(page,/href="\/"|href='\/'/,'staging museum may not expose legacy attendance entry: '+path);
  assert.doesNotMatch(page,/皆勤賞|チャット機能|\/api\/chat/,'no attendance prize/chat promoted: '+path);
 }
 // Retention check: old production attendance/checkin code and user media are protected,
 // NOT deleted or moved just because the new visitor navigation hides its entry.
 for(const path of ['index.html','app.js','api-checkin.js']){
  assert.ok(exists(path));
  assert.equal(shaOfFile(path),baseline.productionFileBlobs[path]);
 }
});
test('gallery layout planning stays off public routes and leaves production catalog untouched',()=>{
 const plan='museum-curation-plan.mjs';
 assert.ok(exists(plan));
 assert.equal(config.builds.some(build=>build.src===plan),false);
 assert.equal(config.routes.some(route=>route.src==='/'+plan),false);
 for(const path of ['museum.html','museum-approved-gallery.html','museum-archive.html']){
  assert.equal(read(path).includes(plan),false,'public page must not load draft layout module');
 }
 for(const path of ['gallery-items.js','api-gallery-items.js','api-gallery-manage.js']){
  assert.equal(shaOfFile(path),baseline.productionFileBlobs[path],'existing public gallery changed');
 }
 assert.equal(config.routes.find(route=>route.src==='/')?.dest,'/index.html',
   'one-time frontpage switch needs separate approval; cannot happen in staging');
});
test('offline rehearsal has SEIRA-style curator controls without live gallery mutation',()=>{
 const page=read('mio-admin-rehearsal.html'),script=read('mio-admin-rehearsal.js');
 for(const id of ['demoGallery','demoGalleryPreview','demoGalleryStatus'])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/並び替え|入れ替え/);
 assert.match(page,/保存・アップロード・本番反映はできません/);
 assert.match(script,/gallery:\[/);
 for(const label of ['↑ 上へ','↓ 下へ','注目にする','非公開にする','公開予定にする','名前を変更'])
  assert.ok(script.includes(label),'missing curator action: '+label);
 for(const id of ['demoGalleryAdd','demoGalleryNewTitle','demoGalleryNewCategory',
  'demoGalleryNewRoom','demoGalleryRoomFilter','demoGalleryPreviewRoom'])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(page,/最初は必ず非公開・確認待ち/);
 assert.match(script,/reviewed:false,rightsConfirmed:false,privacyConfirmed:false,archived:false/);
 assert.match(script,/if\(!item\.rightsConfirmed\|\|!item\.privacyConfirmed\)return/);
 assert.match(script,/公開確認の操作を模擬しました/);
 assert.match(page,/gallery-review-checks input\[type=checkbox\]/);
 assert.match(script,/item\.archived=!item\.archived/);
 assert.match(script,/const visible=s\.gallery\.filter\(x=>eligible\(x\)&&/);
 for(const id of ['demoGalleryDifference','demoGalleryReview','demoGalleryCommit',
  'demoGalleryRollback','demoGalleryPublished','demoGalleryPublishedStatus',
  'demoGallerySearch','demoGalleryFilter','demoGalleryMatchCount',
  'demoGallerySaveDraft','demoGalleryDraftStatus','demoGalleryHistoryVersion',
  'demoGalleryRestoreSummary','demoGalleryRestorePreview'])
  assert.match(page,new RegExp('id="'+id+'"'),'missing release rehearsal control '+id);
 assert.match(page,/編集中の展示プレビュー（下書き）/);
 assert.match(page,/過去の展示順・タイトルを版として保存します/);
 assert.match(script,/galleryPublished\.push\(\{revision,items\}\)/);
 assert.match(script,/room:item\.room/);
 assert.match(script,/item\.room=roomSelect\.value/);
 assert.match(script,/item\.id,item\.title,item\.category,item\.room/);
 for(const room of ["gallery","icons","moments","events"]){
  assert.match(page,new RegExp('value="'+room+'"'));
  assert.match(script,new RegExp(room+":'"));
 }
 assert.match(script,/demoGalleryRoomFilter'\)\.addEventListener\('change',render\)/);
 assert.match(script,/demoGalleryPreviewRoom'\)\.addEventListener\('change',render\)/);
 assert.match(script,/galleryReviewFingerprint!==galleryFingerprint\(\)/);
 assert.match(script,/savedDraftFingerprint!==galleryFingerprint\(\)/);
 assert.match(script,/savedDraftRevision\+\+/);
 assert.match(script,/resetPublication\(\)/);
 assert.match(script,/demoGallerySearch'\)\.addEventListener\('input',render\)/);
 assert.match(script,/demoGalleryFilter'\)\.addEventListener\('change',render\)/);
 assert.match(script,/return current&&eligible\(current\)/);
 assert.match(script,/if\(!actual\|\|!eligible\(actual\)/);
 assert.match(script,/galleryPublished\.slice\(0,-1\)\.reverse\(\)/);
 assert.match(script,/restoreSelectedRevision/);
 assert.match(script,/demoGalleryHistoryVersion'\)\.addEventListener\('change'/);
 assert.match(page,/復元する過去の模擬公開版/);
 assert.match(script,/imageUrl:null \/\/ browser-selected photos are never published/);
 assert.match(script,/URL\.revokeObjectURL/);
 assert.match(script,/file\.accept='image\/jpeg,image\/png,image\/webp'/);
 assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|sessionStorage|indexedDB|\binnerHTML\s*=/);
 assert.doesNotMatch(script,/\/api\/gallery|\/api\/museum/);
});
test('museum homepage leads with an elegant approved-works showcase, never unreviewed media',()=>{
 const html=read('museum.html'),css=read('museum.css');
 const approved=approvedGalleryItems.filter(item=>item.hidden===false);
 assert.equal(approved.length,2,'recheck static approved references before adding more highlights');
 const gallery=html.indexOf('id="exhibits"');
 const showcase=html.indexOf('class="museum-showcase"');
 const rooms=html.indexOf('class="museum-grid"',gallery);
 assert.ok(gallery>=0&&showcase>gallery&&showcase<rooms,
  'visitor should see approved highlights before museum room tiles');
 const section=html.slice(showcase,rooms);
 for(const item of approved){
  assert.ok(section.includes(item.title),'a highlighted work must already be in the approved catalog');
 }
 assert.equal((section.match(/class="museum-showcase-item"/g)||[]).length,2);
 assert.ok(section.includes('href="/museum-approved-gallery.html?kind=music"'));
 assert.ok(section.includes('href="/museum-approved-gallery.html?kind=video"'));
 assert.equal((section.match(/src="\/assets\/gallery-emuzii-mio-cover.svg"/g)||[]).length,2);
 assert.doesNotMatch(section,/blob\.vercel-storage\.com|<script|<iframe|autoplay|onerror=|contenteditable/);
 for(const entry of ['.museum-showcase','.museum-showcase-grid',
  '.museum-showcase-item','.museum-showcase-art','.museum-showcase-cta'])
  assert.ok(css.includes(entry),'missing gallery museum styling '+entry);
 assert.match(css,/@media\(max-width:860px\)/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 const galleryScript=read('museum-approved-gallery.js');
 assert.match(galleryScript,/kind==='video'\?'動画'/);
 assert.match(galleryScript,/kind==='music'\?'音声・楽曲'/);
});
test('all local museum navigation targets and static media assets exist in the main-based copy',()=>{
 for(const path of museumPages){
  const html=read(path);
  for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const value=m[1];
   if(!(value.startsWith('/')||value.startsWith('#')))continue;
   const url=new URL(value,'https://staging.invalid/'+path);
   const target=decodeURIComponent(url.pathname.slice(1))||'index.html';
   assert.ok(exists(target),path+' links to missing '+value);
   if(url.hash){
    const id=decodeURIComponent(url.hash.slice(1));
    if(target!=='index.html')assert.ok(read(target).includes('id="'+id+'"'),path+' missing anchor '+value);
   }
  }
 }
});
