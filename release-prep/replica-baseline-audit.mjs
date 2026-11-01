// Large-update replica baseline audit.
// READ-ONLY: never merges, deploys, alters an existing GAS/DB, or creates test users.
// Run from this repository's checked-out replica branch after fetching origin/main.
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const run=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const hasRef=ref=>{try{run('rev-parse','--verify',ref);return true}catch{return false}};
const blob=(ref,path)=>{try{return run('rev-parse',ref+':'+path)}catch{return null}};
const target='refs/remotes/origin/main';
if(!hasRef(target)){
 console.error('BLOCKED: current origin/main not fetched; no baseline can be trusted.');
 process.exit(2);
}
const head=run('rev-parse','HEAD'),main=run('rev-parse',target);
const branch=run('rev-parse','--abbrev-ref','HEAD');
const critical=[
 ['Vercel production configuration','vercel.json'],
 ['Participant authentication','bridge.js'],
 ['Participant registration','api-register.js'],
 ['Existing participant status','api-status.js'],
 ['Attendance check-in','api-checkin.js'],
 ['Attendance activation','api-activate-attendance.js'],
 ['Gacha draw and protected history','api-gacha.js'],
 ['Participant gacha UI','gacha-page.js'],
 ['Gacha production page','gacha.html'],
 ['Gacha admin gate','gacha-web-gate.html'],
 ['Gacha admin operations','api-gacha-admin-ops.js'],
 ['Gallery items','api-gallery-items.js'],
 ['Gallery administration','api-gallery-manage.js'],
 ['Gallery moderation','api-gallery-moderate.js'],
 ['Gallery page','gallery.html'],
 ['Approved production homepage','index.html']
];
const visual=[
 ['Approved next-home prototype','home-portrait-next.html'],
 ['Whale deluxe preview','gacha-royal-integrated-preview.html'],
 ['Attendance prototype','attendance-deluxe-demo.html'],
 ['Member page prototype','mypage-deluxe-demo.html'],
 ['Gallery/community demo','community-demo.html'],
 ['Music-gallery demo','music-gallery-demo.html'],
 ['Admin center demo','admin-center-demo.html'],
 ['Live functionality mock','integrated-functional-test.html']
];
const rows=critical.map(([feature,path])=>{
 const cur=blob(target,path),copy=blob('HEAD',path);
 return {feature,path,baseline:cur?'present':'missing',
    replica:!copy?'missing':cur===copy?'identical':'diverged',blocker:!cur||!copy||cur!==copy};
});
const demos=visual.map(([feature,path])=>({feature,path,present:!!blob('HEAD',path)}));
const blocking=rows.filter(x=>x.blocker);
const releaseReady=blocking.length===0 && branch==='release/v2-next-integrated-replica';
const ticks=String.fromCharCode(96);
const md=x=>ticks+x+ticks;
const summary=[
 '# MIO large update: copy-integration audit',
 '',
 '- Result: **'+(releaseReady?'BASELINE IDENTICAL (additional checks still needed)':'BLOCKED — do not merge or release')+'**',
 '- Read-only check: no deployment, database, GAS, gacha draws or production request.',
 '- Copy HEAD: '+md(head),
 '- Current baseline origin/main: '+md(main),
 '- Critical baseline blockers: **'+blocking.length+'/'+rows.length+'**',
 '- Visual prototypes present: **'+demos.filter(x=>x.present).length+'/'+demos.length+'**',
 '',
 '| Critical existing function | File | Copy compared with latest main |',
 '|---|---|---|',
 ...rows.map(x=>'| '+x.feature+' | '+md(x.path)+' | '+x.replica+(x.blocker?' — STOP':'')+' |'),
 '',
 '### Visual prototypes (not proof of backend integration)',
 ...demos.map(x=>'- '+(x.present?'Available':'Missing')+': '+md(x.path)),
 '',
 '### Mandatory next gates',
 '- Integrate reviewed UI changes **onto a copy of current main**, not this diverged demo branch as a full replacement.',
 '- In a controlled working copy, compare per-file differences and keep the existing MIO-ID, check-in, attendance, gacha and gallery APIs.',
 '- Obtain actual live Apps Script deployment code/version before adding or changing any GAS admin logic. Candidate files alone do not establish current live behavior.',
 '- Complete administration, gacha/drawId, 31-day attendance, FA, gallery, quiz, community and email/event entry tests with synthetic data.',
 '- Check Safari/iPhone preview, Vercel preview routing and live GAS compatibility without changing participants; save rollback plan and get explicit approval before release.',
 '',
 'This audit is intentionally **not** a release authorization. Even with 0 baseline mismatches, all live-integration and approval gates remain.'
].join('\n');
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY){mkdirSync(dirname(process.env.GITHUB_STEP_SUMMARY),{recursive:true});writeFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n',{flag:'a'});}
if(process.argv.includes('--release-gate') && !releaseReady)process.exit(1);
if(process.argv.includes('--expect-copy-blocked') && releaseReady){
 console.error('Copy unexpectedly identical; re-evaluate the expected-blocker assertion before declaring safety.');
 process.exit(1);
}
