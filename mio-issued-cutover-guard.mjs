// MIO vNext per-participant rollout preflight. Pure simulation: no SQL, GAS,
// HTTP, environment mutation or release switches are exported.
const MIO_ID = /^MIO-(?:[0-9]{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$/;
export const CUTOVER_CHECKS=Object.freeze([
 'ownerVerifiedByServer',
 'rosterIdentityUnique',
 'legacyEntitlementsSnapshotted',
 'attendanceSnapshotVerified',
 'gachaRemainingSnapshotVerified',
 'gachaHistorySnapshotVerified',
 'newDeviceProofVerified',
 'oldApiBypassBlocked',
 'legacySessionInvalidationTested',
 'pr94RecoveryCompatible',
 'isolatedConcurrencyTestPassed',
 'rollbackRecoveryTestPassed'
]);

export function inspectMioCutover(input) {
 // ID or displayed name must never authenticate a person.
 const id=input?.masterId;
 if(typeof id!=='string'||!MIO_ID.test(id))
   return Object.freeze({state:'HOLD',reason:'MASTER_ID_REQUIRED',missing:[]});
 if(input?.scope!=='single-participant')
   return Object.freeze({state:'HOLD',reason:'NO_BULK_CUTOVER',missing:[]});
 if(input?.source!=='server-verified')
   return Object.freeze({state:'HOLD',reason:'TRUSTED_SERVER_PROOF_REQUIRED',missing:[]});
 const missing=CUTOVER_CHECKS.filter(k=>input?.checks?.[k]!==true);
 if(missing.length)return Object.freeze({state:'HOLD',reason:'CHECKS_INCOMPLETE',missing:Object.freeze(missing)});
 // Even when all checks pass, this never executes a rollout or grants access.
 return Object.freeze({state:'READY_FOR_MANUAL_RELEASE_REVIEW',reason:'NO_AUTOMATIC_RELEASE',missing:[]});
}

export function simulateMioTransfer({legacy,proposed,readiness}) {
 // This is NOT a migration function: it only returns an isolated projection.
 const verdict=inspectMioCutover(readiness);
 if(verdict.state!=='READY_FOR_MANUAL_RELEASE_REVIEW')
   return Object.freeze({state:'HOLD',reason:verdict.reason,missing:verdict.missing});
 if(!legacy || !proposed || legacy.masterId!==readiness.masterId || proposed.masterId!==readiness.masterId)
   return Object.freeze({state:'HOLD',reason:'ID_MISMATCH',missing:[]});
 if(!Array.isArray(legacy.devices)||typeof proposed.deviceId!=='string'||!proposed.deviceId.length)
   return Object.freeze({state:'HOLD',reason:'DEVICE_REQUIRED',missing:[]});
 if(typeof legacy.gachaRemaining!=='number'||!Number.isSafeInteger(legacy.gachaRemaining)||
    legacy.gachaRemaining<0||!Array.isArray(legacy.gachaHistory)||
    !Array.isArray(legacy.attendanceHistory))
   return Object.freeze({state:'HOLD',reason:'ENTITLEMENTS_REQUIRED',missing:[]});
 if(!Number.isInteger(proposed.generation)||proposed.generation<1)
   return Object.freeze({state:'HOLD',reason:'GENERATION_REQUIRED',missing:[]});
 const before=structuredClone(legacy);
 const oldDevices=[...new Set(before.devices)].filter(id=>id!==proposed.deviceId);
 const after={
   masterId:before.masterId,
   // Existing entitlements are carried across by ID; not reissued or reset.
   gachaRemaining:before.gachaRemaining,
   gachaHistory:structuredClone(before.gachaHistory),
   attendanceHistory:structuredClone(before.attendanceHistory),
   activeDevices:[proposed.deviceId],
   deniedOldDevices:oldDevices,
   generation:proposed.generation
 };
 return Object.freeze({
   state:'SIMULATED',
   before,
   after,
   rollback:{
     // Never reactivate an already revoked old invite or old device session.
     strategy:'halt-new-claims-and-owner-reissue',
     restoreRevokedSessions:false,
     preserveEntitlements:true,
     requiresOwnerAndIdentityProof:true
   }
 });
}
