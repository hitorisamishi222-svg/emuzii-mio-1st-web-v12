/**
 * NEXT TEST ONLY: atomic transfer workflow contract.
 *
 * No live route, persistent store, GAS, or production calls.
 * The injected TEST store must supply a SERIALIZABLE/row-locked transaction.
 * A VERIFIED, one-time transfer approval is created by an independent trusted
 * operator/recovery flow. Never use a browser-supplied "approved" boolean.
 *
 * Keep all attendance, gacha and gallery records keyed by participant/profile;
 * rotating a device must update only session/approval/audit records.
 */
import {randomBytes} from 'node:crypto';
import {issueTestDeviceSession} from './test-device-session.js';

const ID=/^[A-Za-z0-9_-]{3,120}$/;
const APPROVAL_ID=/^[A-Za-z0-9_-]{16,120}$/;

export class TestTransferError extends Error {
  constructor(code){super(code);this.name='TestTransferError';this.code=code}
}
const invalid=(code)=>{throw new TestTransferError(code)};
const validGeneration=x=>Number.isSafeInteger(x)&&x>=1;
const methods=['consumeVerifiedTransferApproval','lockProfile','rotateSession','audit'];

/**
 * store.transaction(tx => result) MUST be atomic: either everything commits
 * (including consumption, rotation and audit) or NOTHING is saved.
 * Returned session token must be placed in a Secure, HttpOnly, SameSite cookie
 * by a future TEST server, never in an analytics event or URL.
 */
export async function transferTestDevice({
  store,participantId,transferApprovalId,secret,now=Date.now(),ttlMs
}){
  if(typeof participantId!=='string'||!ID.test(participantId)||
     typeof transferApprovalId!=='string'||!APPROVAL_ID.test(transferApprovalId)||
     !Number.isSafeInteger(now)||now<0)invalid('INVALID_TRANSFER_REQUEST');
  if(!store||typeof store.transaction!=='function')invalid('TRANSACTIONAL_TEST_STORE_REQUIRED');

  return store.transaction(async(tx)=>{
    if(!tx||!methods.every(name=>typeof tx[name]==='function'))
      invalid('INCOMPLETE_TEST_TRANSACTION');
    // Consume inside the same DB transaction. The store must lock the approval
    // and check that its trusted administrator verification has completed.
    const approval=await tx.consumeVerifiedTransferApproval({
      transferApprovalId,participantId,now
    });
    if(!approval||approval.id!==transferApprovalId||
       approval.participantId!==participantId||
       approval.verifiedByOperator!==true||
       !Number.isSafeInteger(approval.expiresAt)||approval.expiresAt<=now)
      invalid('TRANSFER_NOT_VERIFIED_OR_USED');

    // The account lock and generation compare-and-swap stop concurrent transfers.
    const account=await tx.lockProfile({participantId});
    if(!account||account.participantId!==participantId||
       account.active!==true||account.participantApproved!==true||
       !validGeneration(account.generation))
      invalid('PARTICIPANT_NOT_ACTIVE');
    if(account.generation===Number.MAX_SAFE_INTEGER)
      invalid('GENERATION_EXHAUSTED');

    const nextGeneration=account.generation+1;
    const nextDeviceId='TESTDEV_'+randomBytes(24).toString('base64url');
    const session=issueTestDeviceSession({
      participantId,deviceId:nextDeviceId,generation:nextGeneration,
      secret,now,...(ttlMs===undefined?{}:{ttlMs})
    });
    const changed=await tx.rotateSession({
      participantId,expectedGeneration:account.generation,
      nextGeneration,nextDeviceId,nextSessionDigest:session.sessionDigest,
      expiresAt:session.expiresAt
    });
    if(changed!==true)invalid('TRANSFER_CONFLICT');

    await tx.audit({
      event:'test_device_transferred',participantId,
      transferApprovalId,previousGeneration:account.generation,
      nextGeneration,at:now
    });
    // Do not return a new cookie if the commit fails: store.transaction rejects.
    return {token:session.token,participantId,deviceId:nextDeviceId,
      generation:nextGeneration,expiresAt:session.expiresAt};
  });
}
