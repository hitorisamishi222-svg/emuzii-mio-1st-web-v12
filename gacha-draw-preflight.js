import {hasSafeGachaContract} from './gacha-contract.js';
import {recordedDrawFromHistory} from './gacha-recorded-replay.js';

/**
 * Return a decision, not a draw. The only write operation ('draw') must be
 * performed by the caller after a successful explicit 'fresh' decision.
 * Both checks here call read-only GAS actions. Transient failure fails closed.
 */
export async function preflightGachaDraw(readBridge, identity, request) {
  let safe=false;
  try {
    const catalog=await readBridge('catalog',identity);
    safe=catalog.participantId===identity.participantId&&hasSafeGachaContract(catalog);
  } catch { /* Never allow a fresh draw when catalog could not be verified. */ }
  if (safe) return {kind:'fresh'};
  try {
    const history=await readBridge('history',identity);
    const data=recordedDrawFromHistory(history,{
      participantId:identity.participantId,drawId:request.drawId,mode:request.mode
    });
    if (data) return {kind:'replayed',data};
  } catch { /* Recovery is not permission to create or retry a draw. */ }
  return {kind:'blocked'};
}
