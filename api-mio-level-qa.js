// Synthetic-only race and connection test. Protected by the existing Vercel
// Preview SSO gate and an exact branch/database/origin allowlist.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {issuerRegisterAccess, claimIssuedAccess} from './mio-level-registration-vnext.mjs';
import {codeDigest} from './mio-level-access-vnext.mjs';
import {isSyntheticPreview} from './mio-level-preview-scope.mjs';

const {Pool} = pg;
let pool;
function database() {
  if (!pool) pool = new Pool({connectionString:process.env.MIO_LEVEL_DATABASE_URL,
    ssl:{rejectUnauthorized:true}, max:8, connectionTimeoutMillis:5000,
    idleTimeoutMillis:10000, application_name:'mio-recovery-preview-qa'});
  return pool;
}
const ids=[['MIO-9998','Synthetic QA A'],['MIO-9999','Synthetic QA B']];
const actor={source:'server-session',role:'owner',userId:'preview-synthetic-owner'};
const pepperFor=(env)=>env.MIO_LEVEL_ACCESS_PEPPER;
const device={source:'server-verified-signature',fresh:true,
 fingerprint:'sha256:'+'a'.repeat(64),publicJwk:null};
const assert=(condition,name)=>{if(!condition)throw Error('QA_ASSERTION:'+name);return name;};

export async function runPreviewQa({db,pepper}) {
  const results=[];
  const clients=await Promise.all([db.connect(),db.connect()]);
  try {
    const [a,b]=await Promise.all(clients.map(c=>c.query('SELECT pg_backend_pid() AS pid')));
    assert(String(a.rows[0].pid)!==String(b.rows[0].pid),'separate-postgres-backend-pids');
    results.push('独立DB接続: 別々のPostgreSQL PIDを確認');
  } finally {clients.forEach(c=>c.release());}

  const issue=(masterId,displayName)=>issuerRegisterAccess({db,actor,issuerId:'mio',masterId,
    displayName,level:2,rosterProof:{source:'gas-verified',unique:true,masterId,displayName},pepper});
  const startA=(await db.query('SELECT generation FROM mio_level_accounts_v1 WHERE master_id=$1',[ids[0][0]])).rows[0];
  const priorGenerationA=Number(startA?.generation||0);
  const [a0,b0]=await Promise.all(ids.map(([id,name])=>issue(id,name)));
  const count=(await db.query("SELECT count(*)::int AS n FROM mio_level_invites_v1 WHERE status='issued' AND master_id=ANY($1::text[])",[[ids[0][0],ids[1][0]]])).rows[0].n;
  assert(count===2,'parallel-issuance-independent-users');
  results.push('同時発行: A/B両方の未使用IDを確認');

  const raced=await Promise.all([issue(ids[0][0],ids[0][1]),issue(ids[0][0],ids[0][1])]);
  const live=(await db.query("SELECT code_hash FROM mio_level_invites_v1 WHERE master_id=$1 AND status='issued'",[ids[0][0]])).rows;
  assert(live.length===1,'parallel-reissue-one-live-code');
  const winning=raced.find(x=>codeDigest(x.code,pepper)===live[0].code_hash);
  assert(Boolean(winning),'parallel-reissue-winner-matches');
  assert((await db.query("SELECT count(*)::int AS n FROM mio_level_invites_v1 WHERE master_id=$1 AND status='issued'",[ids[1][0]])).rows[0].n===1,'other-user-id-preserved');
  results.push('同時再発行: Aは1枚だけ有効、BのIDも維持');
  const cleanup=await Promise.all([a0,b0].map((x,i)=>claimIssuedAccess({db,displayName:ids[i][1],code:x.code,deviceProof:device,pepper}).then(()=>({ok:true}),()=>({ok:false}))));
  assert(cleanup[0].ok===false&&cleanup[1].ok===true,'retired-code-rejected-other-user-code-works');
  // The former code for A was retired by the reissue. B's independent code
  // remains valid unless it was consumed in the cleanup attempt above.
  const bLive=(await db.query("SELECT code_hash FROM mio_level_invites_v1 WHERE master_id=$1 AND status='issued'",[ids[1][0]])).rows;
  assert(bLive.length===0,'test-cleanup-consumed-b-code');
  const [race1,race2]=await Promise.all([
    claimIssuedAccess({db,displayName:ids[0][1],code:winning.code,deviceProof:device,pepper}),
    claimIssuedAccess({db,displayName:ids[0][1],code:winning.code,deviceProof:device,pepper})
  ].map(p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}))));
  assert(Number(race1.ok)+Number(race2.ok)===1,'double-claim-single-winner');
  results.push('二重登録: 同じIDの同時登録は1件だけ成功');
  const account=(await db.query('SELECT status,generation,session_hash FROM mio_level_accounts_v1 WHERE master_id=$1',[ids[0][0]])).rows[0];
  assert(account?.status==='active'&&Number(account.generation)===priorGenerationA+1,'claim-activates-one-device-session');
  const oldSession=account.session_hash;
  await issue(ids[0][0],ids[0][1]);
  const after=(await db.query('SELECT generation,session_hash FROM mio_level_accounts_v1 WHERE master_id=$1',[ids[0][0]])).rows[0];
  assert(Number(after.generation)===1&&after.session_hash===oldSession,'reissue-does-not-evict-current-device');
  results.push('再発行: 登録済み端末セッションは維持');
  return {ok:true,results};
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Robots-Tag','noindex,nofollow');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  const host=String(req.headers.host||''), origin=String(req.headers.origin||'');
  if(!isSyntheticPreview(process.env,{host,origin}))return res.status(503).json({ok:false,error:'PREVIEW_ONLY'});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
  if(!req.body||req.body.confirm!=='RUN_SYNTHETIC_QA')return res.status(400).json({ok:false,error:'CONFIRM_SYNTHETIC_QA'});
  try {return res.status(200).json(await runPreviewQa({db:database(),pepper:pepperFor(process.env)}));}
  catch(e){console.error('MIO preview QA failed',String(e?.message||'QA_FAILED').slice(0,120));return res.status(409).json({ok:false,error:'QA_FAILED'});}
}
