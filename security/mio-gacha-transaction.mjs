// Development-only PostgreSQL transaction adapter. No connection or API endpoint is created.
// Pass a pg-compatible pool with connect(), and a trusted authenticated accountId.
// This module must run server-side only; never accept accountId from a browser payload.
import { randomUUID } from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function drawGachaTransaction(pool,{accountId,requestKey,selectPrize}){
 if(!UUID.test(accountId)||typeof requestKey!=='string'||requestKey.length<12||requestKey.length>128||typeof selectPrize!=='function')throw Error('invalid request');
 const client=await pool.connect();let begun=false;
 try{
  await client.query('BEGIN');begun=true;
  // Serialize all draws for one account, including duplicate requests.
  const lock=await client.query('SELECT account_id FROM mio_accounts_v21 WHERE account_id=$1 FOR UPDATE',[accountId]);
  if(lock.rowCount!==1)throw Error('account not found');
  const existing=await client.query('SELECT draw_id,prize_code FROM mio_gacha_draws_v21 WHERE account_id=$1 AND request_key=$2',[accountId,requestKey]);
  if(existing.rowCount){
   await client.query('COMMIT');begun=false;
   return {status:'replayed',drawId:existing.rows[0].draw_id,prizeCode:existing.rows[0].prize_code};
  }
  const balance=await client.query('UPDATE mio_gacha_balances_v21 SET remaining=remaining-1,updated_at=now() WHERE account_id=$1 AND remaining>0 RETURNING remaining',[accountId]);
  if(balance.rowCount!==1){await client.query('COMMIT');begun=false;return {status:'no_rights'}}
  // Prize selection must use a vetted server-side secure RNG and published rarity policy.
  const prizeCode=await selectPrize();
  if(typeof prizeCode!=='string'||prizeCode.length<1||prizeCode.length>128)throw Error('invalid prize');
  const drawId=randomUUID();
  await client.query('INSERT INTO mio_gacha_draws_v21(draw_id,account_id,request_key,prize_code) VALUES($1,$2,$3,$4)',[drawId,accountId,requestKey,prizeCode]);
  await client.query('COMMIT');begun=false;
  return {status:'drawn',drawId,prizeCode,remaining:Number(balance.rows[0].remaining)};
 }catch(e){if(begun)await client.query('ROLLBACK');throw e}
 finally{client.release()}
}
