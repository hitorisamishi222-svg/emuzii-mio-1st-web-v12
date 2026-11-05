// MIO museum DRAFT-ONLY; no route, no real database connection is created.
// Ownership and application-level release flags must be validated by the
// eventual server entrypoint. This wrapper only protects transaction affinity.
// A "pool.query" shortcut CANNOT satisfy the connection contract.
// Never promote this helper to an API without verifying the actual DB branch,
// restorable backup, existing GAS, admin device, and owner approval.
export async function withDedicatedMuseumStageClient(pool,{verifyBinding,perform}={}){
 if(!pool||typeof pool.connect!=='function'||typeof verifyBinding!=='function'||
    typeof perform!=='function')throw Error('MUSEUM_CLIENT_DEPENDENCY_REQUIRED');
 let client;
 try{
  client=await pool.connect();
 }catch{
  throw Error('MUSEUM_CLIENT_CONNECT_FAILED');
 }
 if(!client||typeof client.query!=='function'||typeof client.release!=='function'){
  const error=Error('MUSEUM_CLIENT_INVALID');
  if(typeof client?.release==='function')client.release(error);
  throw error;
 }
 let unsafeError=null;
 try{
  // Callback must be an independent server-side binding check. The result
  // cannot be taken from an HTTP request body or an environment key's presence.
  // "schemaReady" means schema checked against this actual connection,
  // not that an unapplied .sql file exists on GitHub.
  // "previewEnvScopeVerified" requires independently verified complete
  // Vercel metadata and endpoint affinity. An inherited Preview env key is
  // not a binding proof, and a metadata-only comparison is not authorization.
  const binding=await verifyBinding(client);
  if(!binding||binding.identityVerified!==true||binding.schemaReady!==true||
     binding.sourceReady!==true||binding.layoutReady!==true||
     binding.previewEnvScopeVerified!==true||
     binding.backupVerified!==true||binding.ownerApproved!==true)
   throw Error('MUSEUM_CLIENT_BINDING_NOT_VERIFIED');
  return await perform(client);
 }catch(error){
  // A failed or uncertain transaction must not return a session to the pool.
  unsafeError=error instanceof Error?error:new Error('MUSEUM_CLIENT_EXECUTION_FAILED');
  throw unsafeError;
 }finally{
  // node-postgres discard-on-error release; don't reuse a potentially
  // aborted, unconfirmed, or still-open transaction on the next request.
  client.release(unsafeError||undefined);
 }
}
