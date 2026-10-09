/**
 * emuzii-wide least-privilege change policy.
 * All role/scopes/approval data must be supplied by a verified server-side identity.
 * Do not import this module into production handlers until integrated and tested.
 */
const POLICY=Object.freeze({
  branch_code_edit:{risk:'development',scope:'dev:write'},
  isolated_test_data:{risk:'development',scope:'test:write'},
  public_announcement:{risk:'routine',scope:'content:write'},
  live_schedule:{risk:'routine',scope:'content:write'},
  gallery_approve:{risk:'routine',scope:'media:moderate'},
  chat_moderate:{risk:'routine',scope:'chat:moderate'},
  participant_approve:{risk:'restricted',scope:'participants:manage'},
  gacha_grant:{risk:'restricted',scope:'gacha:manage'},
  gacha_probability:{risk:'restricted',scope:'gacha:manage'},
  production_release:{risk:'critical',scope:'release:production'},
  bulk_delete:{risk:'critical',scope:'data:delete'},
  secret_rotate:{risk:'critical',scope:'secrets:manage'},
  administrator_change:{risk:'critical',scope:'admin:manage'}
});
export const OPERATION_POLICY=POLICY;
export class PolicyError extends Error {
  constructor(code){super(code);this.code=code;this.name='PolicyError'}
}
const isTrustedActor=a=>Boolean(a&&a.verified===true&&typeof a.id==='string'&&a.id.length>0&&Array.isArray(a.scopes));
export function authorizeOperation({operation,actor,environment='production',approval=null,controls={}}){
  const rule=POLICY[operation];
  if(!rule)throw new PolicyError('UNKNOWN_OPERATION');
  if(!isTrustedActor(actor))throw new PolicyError('UNVERIFIED_ACTOR');
  if(!actor.scopes.includes(rule.scope))throw new PolicyError('MISSING_SCOPE');
  if(controls.emergencyStop===true && environment==='production' && rule.risk!=='development')throw new PolicyError('EMERGENCY_STOP');
  if(rule.risk==='development'){
    if(environment==='production')throw new PolicyError('ISOLATED_ONLY');
    if(!['preview','test'].includes(environment))throw new PolicyError('BAD_ENVIRONMENT');
  } else if(environment!=='production' && environment!=='test')throw new PolicyError('BAD_ENVIRONMENT');
  if(rule.risk==='routine' && environment==='production' && controls.routineWritesEnabled!==true)throw new PolicyError('ROUTINE_WRITES_DISABLED');
  if(['restricted','critical'].includes(rule.risk)){
    // Approval must be issued/verified by a trusted back-end, not a user-submitted boolean.
    if(!approval || approval.verified!==true || approval.operation!==operation || approval.actorId!==actor.id ||
       !Number.isFinite(approval.expiresAt) || approval.expiresAt<=Date.now())
      throw new PolicyError('EXPLICIT_APPROVAL_REQUIRED');
  }
  return {risk:rule.risk,scope:rule.scope,needsAudit:true,needsRollbackCheckpoint:environment==='production'};
}
/**
 * Inject durable audit/checkpoint/idempotency facilities.
 * The driver must implement atomic acquire(requestId, actorId, operation); never use process memory in production.
 */
export async function applyAuthorizedChange({operation,actor,environment,approval,controls,requestId,payload,driver}){
  const decision=authorizeOperation({operation,actor,environment,approval,controls});
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(String(requestId||'')))throw new PolicyError('BAD_REQUEST_ID');
  if(!driver || !['acquire','validate','audit','apply','checkpoint','rollback'].every(k=>typeof driver[k]==='function'))
    throw new PolicyError('DURABLE_DRIVER_REQUIRED');
  const acquired=await driver.acquire({requestId,actorId:actor.id,operation});
  if(acquired!==true)throw new PolicyError('DUPLICATE_REQUEST');
  let snapshot;
  try{
    await driver.validate({operation,payload,actor,environment});
    if(decision.needsRollbackCheckpoint) snapshot=await driver.checkpoint({operation,payload});
    // Fail closed on audit errors. Never log secret values or full personal records.
    await driver.audit({event:'attempt',requestId,actorId:actor.id,operation,environment});
    const result=await driver.apply({operation,payload,actor,environment});
    await driver.audit({event:'success',requestId,actorId:actor.id,operation,environment});
    return result;
  }catch(err){
    if(snapshot!==undefined){
      try{await driver.rollback({operation,snapshot});}catch{ /* escalate rollback failure */ 
        throw new PolicyError('ROLLBACK_FAILED');
      }
    }
    throw err;
  }
}
