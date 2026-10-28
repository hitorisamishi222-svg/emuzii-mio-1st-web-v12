import {hasSafeGachaContract} from './gacha-contract.js';
import {recordedDrawFromHistory} from './gacha-recorded-replay.js';

/**
 * Read-only, fail-closed decision before the ONLY write action ('draw').
 * A valid catalog is necessary but NOT sufficient: new draws also require
 * membership approval, rights, an open admin gate and a configured mode.
 *
 * If any precondition is not met, request authenticated history only to
 * recover an already committed result. Never invoke the draw action here.
 */
export async function preflightGachaDraw(readBridge, identity, request) {
  if (!identity || !request ||
      !/^MIO-W-[a-f0-9]{24}$/.test(identity.participantId || '') ||
      !/^[a-f0-9]{32}$/.test(request.drawId || '') ||
      !['通常', 'ラキフェス'].includes(request.mode)) return {kind:'blocked'};

  let catalogValid=false, allowed=false;
  try {
    const catalog=await readBridge('catalog',identity);
    catalogValid=catalog.participantId===identity.participantId &&
      hasSafeGachaContract(catalog);
    if (catalogValid) {
      allowed=catalog.confirmed===true && catalog.remaining>0 &&
        (request.mode==='通常'
          ? catalog.normalOpen===true && catalog.normal.ready===true
          : catalog.festEntitled===true && catalog.festUnlocked===true &&
            catalog.festOpen===true && catalog.fest.ready===true);
    }
  } catch { /* Catalog failures never permit a fresh draw. */ }

  if (allowed) return {kind:'fresh'};

  try {
    const history=await readBridge('history',identity);
    const data=recordedDrawFromHistory(history,{
      participantId:identity.participantId,drawId:request.drawId,mode:request.mode
    });
    if (data) return {kind:'replayed',data};
  } catch { /* History failure does not permit a new draw. */ }

  return catalogValid ? {kind:'blocked',reason:'gate'} : {kind:'blocked'};
}
