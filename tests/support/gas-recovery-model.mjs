/**
 * TEST-ONLY recovery state machine. NOT live GAS code.
 * Models serialized LockService semantics and a durable intent before
 * updating an EXISTING Web registration token hash.
 */
export function createGasModel({
  webId='MIO-W-'+'1'.repeat(24),masterId='MIO-0010',
  now=Date.now(),ttl=15*60*1000
}={}){
  const grantHash='a'.repeat(64);
  const row={webId,masterId,status:'承認済み',tokenHash:'0'.repeat(64),
    attendance:17,gacha:3,fa:['A','B']};
  const grant={grantHash,approved:true,approvedWebId:webId,
    approvedMasterId:masterId,expiresAt:now+ttl,boundHash:null,used:false};
  const rows=[row],stats={intentWrites:0,tokenWrites:0,completions:0};
  let chain=Promise.resolve();
  function recover(payload,{at=now,failAfterIntent=false,failAfterBind=false}={}){
    const run=async()=>{
      const {grantHash:given,tokenHash}=payload||{};
      if(!/^[a-f0-9]{64}$/.test(given||'')||
         !/^[a-f0-9]{64}$/.test(tokenHash||''))throw Error('invalid');
      if(given!==grant.grantHash||!grant.approved||at>grant.expiresAt)
        throw Error('invalid grant');
      const matches=rows.filter(r=>r.webId===grant.approvedWebId);
      if(matches.length!==1||matches[0].status!=='承認済み'||
         matches[0].masterId!==grant.approvedMasterId)
        throw Error('identity not unique');
      if(grant.boundHash&&grant.boundHash!==tokenHash)
        throw Error('different token retry');
      if(grant.used&&row.tokenHash!==tokenHash)throw Error('binding lost');
      if(!grant.boundHash){grant.boundHash=tokenHash;stats.intentWrites++}
      if(failAfterIntent)throw Error('interrupted after intent');
      if(row.tokenHash!==tokenHash){row.tokenHash=tokenHash;stats.tokenWrites++}
      if(failAfterBind)throw Error('interrupted after binding');
      if(!grant.used){grant.used=true;stats.completions++}
      return {ok:true,verified:true,recoveryApproved:true,recoveryConsumed:true,
        recoveryTokenBound:true,boundTokenHash:tokenHash,status:row.status,
        participantId:row.webId,approvedWebId:row.webId,
        integratedParticipantId:row.masterId,approvedMasterId:row.masterId};
    };
    const result=chain.then(run);chain=result.catch(()=>{});return result;
  }
  return {recover,grant,row,rows,stats,grantHash};
}
