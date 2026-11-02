// Staging-only validation of a hypothetical read-only operator snapshot.
// NOT wired into production APIs, deployed GAS, authentication or any database.
const countFields=[
 'totalPending','pendingRegistrationCount','pendingIdentityCount','pendingSimpleCount',
 'unknownWebStatusCount','unknownSimpleStatusCount','invalidWebIdCount',
 'incompleteSimpleRowCount','duplicateWebIdCount','duplicateMioIdCount','rejectedCount'
];
function reject(){
 throw new Error('管理台帳の待機人数を検証できません。既存GAS接続を確認してください');
}
export function validateQueueSnapshot(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.ok!==true)reject();
 for(const field of ['pending','roster','simple','simplePending']){
  if(!Array.isArray(value[field]))reject();
 }
 if(countFields.some(field=>!Number.isSafeInteger(value[field])||value[field]<0))reject();
 if(value.totalPending!==value.pendingRegistrationCount+value.pendingIdentityCount)reject();
 if(typeof value.pendingListTruncated!=='boolean'||typeof value.simplePendingListTruncated!=='boolean')reject();
 if(value.pending.length>value.totalPending||value.simplePending.length>value.pendingSimpleCount)reject();
 // The GAS candidate deliberately returns exactly the latest 80 Web
 // applications and 60 simple applications. Fewer items with a larger
 // claimed total means partial transport/corrupted response, not truncation.
 if(value.pending.length!==Math.min(value.totalPending,80)||
    value.simplePending.length!==Math.min(value.pendingSimpleCount,60))reject();
 if(value.pendingListTruncated!==(value.pending.length<value.totalPending)||
    value.simplePendingListTruncated!==(value.simplePending.length<value.pendingSimpleCount))reject();
 // Only non-identifying aggregates are returned. Never echo Web IDs,
 // registration names, tokens, contact details or live participant rows.
 return Object.freeze({
  pendingRegistrationCount:value.pendingRegistrationCount,
  pendingIdentityCount:value.pendingIdentityCount,
  pendingSimpleCount:value.pendingSimpleCount,
  totalPending:value.totalPending,
  rejectedCount:value.rejectedCount,
  unknownWebStatusCount:value.unknownWebStatusCount,
  unknownSimpleStatusCount:value.unknownSimpleStatusCount,
  invalidWebIdCount:value.invalidWebIdCount,
  incompleteSimpleRowCount:value.incompleteSimpleRowCount,
  duplicateWebIdCount:value.duplicateWebIdCount,
  duplicateMioIdCount:value.duplicateMioIdCount,
  pendingListTruncated:value.pendingListTruncated,
  simplePendingListTruncated:value.simplePendingListTruncated,
  hasUnclassifiedRows:(
   value.unknownWebStatusCount+value.unknownSimpleStatusCount+
   value.invalidWebIdCount+value.incompleteSimpleRowCount+
   value.duplicateWebIdCount+value.duplicateMioIdCount
  )>0
 });
}
