// Manual-only decision handling for registration v2.
// Authorization MUST be checked by the caller. Never expose directly on a public API.
import pg from 'pg';
const {Pool}=pg;
let pool;
function database(){
 const url=process.env.MIO_REGISTRATION_DATABASE_URL;
 if(!url)throw Error('Registration v2 database is not configured');
 if(!pool)pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:true},max:3});
 return pool;
}
const validId=x=>/^MIO-W-[a-f0-9]{24}$/.test(x||'');
const validMioId=x=>/^MIO-[0-9]{4}$/.test(x||'');
export async function reviewEnrollment({browserId,decision,participantId='',reviewer,reason=''}, {db=database()}={}){
 if(!validId(browserId))throw Error('Invalid browser ID');
 if(decision!=='承認済み'&&decision!=='却下')throw Error('Unsupported review decision');
 if(!reviewer||typeof reviewer!=='string'||reviewer.length>80)throw Error('Reviewer identity required');
 if(decision==='承認済み'&&!validMioId(participantId))throw Error('Verified MIO-ID required');
 if(reason&&typeof reason!=='string')throw Error('Invalid reason');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const found=await client.query('SELECT browser_id,status,integrated_participant_id FROM mio_registration_v2 WHERE browser_id=$1 FOR UPDATE',[browserId]);
  if(found.rows.length!==1)throw Error('Browser registration not found');
  if(found.rows[0].status!=='承認待ち')throw Error('Only pending registration may be reviewed');
  // Explicit administrative choice. Never look up a legacy ID by a matching name.
  const updated=await client.query(
   `UPDATE mio_registration_v2 SET status=$2, integrated_participant_id=$3,
       approved_by=$4, approved_at=now(), updated_at=now()
       WHERE browser_id=$1 AND status='承認待ち'
       RETURNING browser_id,status,integrated_participant_id`,
   [browserId,decision,decision==='承認済み'?participantId:null,reviewer]);
  if(updated.rows.length!==1)throw Error('Review was not applied');
  await client.query('COMMIT');
  return {ok:true,...updated.rows[0]};
 }catch(err){await client.query('ROLLBACK');throw err}
 finally{client.release()}
}
