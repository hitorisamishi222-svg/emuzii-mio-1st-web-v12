// Registration v2: independent, auditable enrollment core.
// This module does not touch GAS, legacy MIO-ID assignments, gacha or attendance.
// No automatic identity linking from a ColorSing name or recovery login ID.
import pg from 'pg';
const {Pool}=pg;
let pool;
export const schemaSQL=`
CREATE TABLE IF NOT EXISTS mio_registration_v2 (
  browser_id text PRIMARY KEY CHECK (browser_id ~ '^MIO-W-[a-f0-9]{24}$'),
  token_hash char(64) NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  name_normalized text NOT NULL,
  login_id_claim text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '承認待ち'
    CHECK (status IN ('承認待ち','承認済み','却下')),
  integrated_participant_id text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approved_requires_verified_id CHECK (
    status <> '承認済み' OR
    (integrated_participant_id ~ '^MIO-[0-9]{4}$' AND
     approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS mio_registration_v2_name_idx
  ON mio_registration_v2(name_normalized);
`;
export const normalizeName=(name)=>String(name||'').normalize('NFKC').replace(/[\s\u3000]+/g,'').trim();
export function validateEnrollment(payload){
 const browserId=String(payload?.browserId||'');
 const tokenHash=String(payload?.tokenHash||'');
 const name=String(payload?.name||'').trim();
 const loginId=String(payload?.loginId||'').trim();
 if(!/^MIO-W-[a-f0-9]{24}$/.test(browserId))throw Error('invalid browser identity');
 if(!/^[a-f0-9]{64}$/.test(tokenHash))throw Error('invalid token hash');
 if(name.length<1||name.length>40||/[\\x00-\\x1f]/.test(name))throw Error('invalid ColorSing name');
 if(loginId.length>32||/[\\x00-\\x1f]/.test(loginId))throw Error('invalid login id');
 return {browserId,tokenHash,name,nameNormalized:normalizeName(name),loginId};
}
function database(){
 const url=process.env.MIO_REGISTRATION_DATABASE_URL;
 if(!url)throw Error('Registration v2 database has not been configured');
 if(!pool)pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:5000});
 return pool;
}
// Manual schema migration must be applied to the *dedicated* database before activation.
export async function enroll(payload,{db=database()}={}){
 const x=validateEnrollment(payload);
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  // Stable browser identity is the sole idempotency key. Never update historical rows.
  const saved=await client.query(`
   INSERT INTO mio_registration_v2(browser_id,token_hash,name,name_normalized,login_id_claim)
   VALUES($1,$2,$3,$4,$5)
   ON CONFLICT (browser_id) DO NOTHING
   RETURNING browser_id,name,status,integrated_participant_id`,
   [x.browserId,x.tokenHash,x.name,x.nameNormalized,x.loginId]);
  let row=saved.rows[0], created=!!row;
  if(!row){
   const lookup=await client.query(`
    SELECT browser_id,name,status,integrated_participant_id,token_hash
    FROM mio_registration_v2 WHERE browser_id=$1 FOR UPDATE`,[x.browserId]);
   row=lookup.rows[0];
   if(!row||row.token_hash!==x.tokenHash||row.name!==x.name)
     throw Error('identity mismatch: administrator confirmation required');
  }
  await client.query('COMMIT');
  return {ok:true,verified:true,created,participantId:row.browser_id,
   name:row.name,status:row.status,integratedParticipantId:row.integrated_participant_id||''};
 }catch(err){await client.query('ROLLBACK');throw err}
 finally{client.release()}
}
// Approval deliberately requires explicit admin action in a separately authenticated service.
// This public module exposes no approval endpoint or name-only linking.
export async function statusForBrowser(browserId,tokenHash,{db=database()}={}){
 validateEnrollment({browserId,tokenHash,name:'-',loginId:''});
 const r=await db.query(`SELECT browser_id,name,status,integrated_participant_id,token_hash
   FROM mio_registration_v2 WHERE browser_id=$1`,[browserId]);
 const row=r.rows[0];
 if(!row||row.token_hash!==tokenHash)throw Error('unauthorized');
 return {ok:true,participantId:row.browser_id,name:row.name,status:row.status,
   integratedParticipantId:row.integrated_participant_id||''};
}
