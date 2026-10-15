/** NEXT TEST ONLY: add a verified device session without signing out other devices. */
import {randomBytes} from 'node:crypto';
import {issueTestDeviceSession} from './test-device-session.js';

const ID=/^[A-Za-z0-9_-]{3,120}$/;
const APPROVAL_ID=/^[A-Za-z0-9_-]{16,120}$/;
export class TestTransferError extends Error {
  constructor(code){super(code);this.name='TestTransferError';this.code=code}
}
const invalid=(code)=>{throw new TestTransferError(code)};
const methods=['consumeVerifiedTransferApproval','lockProfile','createSession','audit'];

/**
 * store.transaction MUST commit approval consumption, new session and audit
 * together or roll all three back. participantId comes from the authenticated
 * TEST session, never from an untrusted UI field.
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
    const approval=await tx.consumeVerifiedTransferApproval({
      transferApprovalId,participantId,now
    });
    if(!approval||approval.id!==transferApprovalId||
       approval.participantId!==participantId||approval.verifiedByOperator!==true||
       !Number.isSafeInteger(approval.expiresAt)||approval.expiresAt<=now)
      invalid('TRANSFER_NOT_VERIFIED_OR_USED');

    const account=await tx.lockProfile({participantId});
    if(!account||account.participantId!==participantId||
       account.active!==true||account.participantApproved!==true)
      invalid('PARTICIPANT_NOT_ACTIVE');

    const deviceId='TESTDEV_'+randomBytes(24).toString('base64url');
    const session=issueTestDeviceSession({
      participantId,deviceId,secret,now,...(ttlMs===undefined?{}:{ttlMs})
    });
    const created=await tx.createSession({
      participantId,deviceId,sessionId:session.sessionId,
      sessionDigest:session.sessionDigest,expiresAt:session.expiresAt,createdAt:now
    });
    if(created!==true)invalid('SESSION_CREATE_CONFLICT');
    await tx.audit({event:'test_device_added',participantId,
      transferApprovalId,deviceId,at:now});
    return {token:session.token,participantId,deviceId,
      sessionId:session.sessionId,expiresAt:session.expiresAt};
  });
}
