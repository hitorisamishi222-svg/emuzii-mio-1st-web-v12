import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler,{normalizeInviteCode,issueInviteSession,readInviteSession} from '../api-gacha-invite.js';
const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const gs=text('GAS_GachaInvite_20261030.gs');
const html=text('gacha-invite.html');
const cfg=JSON.parse(text('vercel.json'));
test('human-friendly invite code accepts case and separators, rejects short/guessed identifiers',()=>{
 assert.equal(normalizeInviteCode('mi-12ab-34cd-56ef-7890'),'MI12AB34CD56EF7890');
 for(const wrong of ['', 'MIO-0017','123456','MI-1234','MI-1234-1234-1234-Z999','MI12345678901234567'])
  assert.equal(normalizeInviteCode(wrong),null);
});
test('signed invitation cookie is scoped, expires and rejects tampering',()=>{
 const secret='test-only-secret-'.repeat(3),id='MIO-W-'+'a'.repeat(24),token='b'.repeat(64);
 const line=issueInviteSession(id,token,secret,Math.floor(Date.now()/1000));
 assert.match(line,/mio_invite_gacha=/);assert.match(line,/Path=\/api\/gacha-invite/);
 assert.doesNotMatch(line,/mio_session=/);
 const v=readInviteSession(line,secret);assert.equal(v?.id,id);
 const damaged=line.replace('mio_invite_gacha=','mio_invite_gacha=x');
 assert.equal(readInviteSession(damaged,secret),null);
 assert.equal(readInviteSession(line,'different-'+secret),null);
 const old=issueInviteSession(id,token,secret,Math.floor(Date.now()/1000)-8*24*3600);
 assert.equal(readInviteSession(old,secret),null);
});
test('GAS code can compile without replacing any preexisting doPost handler',()=>{
 assert.doesNotThrow(()=>new Function(gs));
 assert.doesNotMatch(gs,/function doPost\s*\(/);
 assert.match(gs,/gachaRapidAdmin_\(\)/);
 assert.match(gs,/LockService\.getScriptLock\(\)/);
 assert.match(gs,/gachaInviteQualified_/);
 assert.match(gs,/gachaInviteRedeem_/);
 assert.match(gs,/使用済み/);
 assert.match(gs,/ensureWebDerivedRow_\(web,row\)/);
});
test('GAS dispatcher patch fits existing source after authorization, before normal register',()=>{
 const source=text('APPS_SCRIPT_Code_v1.9.1_LOGIN_ID.gs');
 const needle='    ensureLoginIdHeader_(web);';
 assert.ok(source.includes(needle));
 const insertion="\n    if(d.action==='inviteRedeem')return json_(gachaInviteRedeem_(ss,web,d));";
 const merged=source.replace(needle,needle+insertion);
 assert.doesNotThrow(()=>new Function(merged+'\n'+gs));
 const auth=merged.indexOf("if(!secret||!equal_(d.secret,secret))");
 const insert=merged.indexOf("if(d.action==='inviteRedeem')");
 const register=merged.indexOf("if(d.action==='register')");
 assert.ok(auth>=0&&auth<insert&&insert<register);
});
test('independent page has code entry, shared history recovery, no signup workflow',()=>{
 assert.match(html,/id="codeForm"/);assert.match(html,/id="remaining"/);
 assert.match(html,/id="recover"/);
 assert.match(html,/mio_invite_pending_draw_/);
 assert.match(html,/action:'history'/);
 assert.doesNotMatch(html,/\/api\/register/);
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);assert.doesNotThrow(()=>new Function(script));
});
test('invite route is distinct and existing draw route untouched',()=>{
 const route=path=>cfg.routes.find(x=>x.src===path);
 assert.equal(route('/api/gacha-invite')?.dest,'/api-gacha-invite.js');
 assert.equal(route('/gacha-invite.html')?.dest,'/gacha-invite.html');
 assert.equal(route('/api/gacha')?.dest,'/api-gacha.js');
 assert.ok(cfg.builds.some(x=>x.src==='api-gacha-invite.js'));
});
test('invite API defaults disabled even if a code is submitted',async()=>{
 const keys=['VERCEL_ENV','APPS_SCRIPT_SECRET','APPS_SCRIPT_URL','MIO_GACHA_INVITE_RELEASE'];
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  process.env.VERCEL_ENV='production';
  process.env.APPS_SCRIPT_SECRET='a'.repeat(40);
  process.env.APPS_SCRIPT_URL='https://script.google.com/macros/s/TEST/exec';
  delete process.env.MIO_GACHA_INVITE_RELEASE;
  const req={method:'POST',headers:{host:'local.test','content-type':'application/json'},body:{action:'redeem',code:'MI-1234-1234-1234-1234'}};
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(x){this.data=x;return this}};
  await handler(req,res);
  assert.equal(res.code,503);assert.equal(res.data?.ok,false);
  assert.ok(!res.headers['Set-Cookie']);
 }finally{for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k]}}
});
