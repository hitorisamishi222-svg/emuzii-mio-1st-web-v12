/**
 * Server-only bootstrap gate for first passkey registration.
 * Production GAS membership must be independently verified before deployment.
 */
const MIO=/^MIO-[0-9]{4}$/;
const BROWSER=/^MIO-W-[a-f0-9]{24}$/;
const HASH=/^[a-f0-9]{64}$/;
const METHODS=new Set(['webauthn-uv','approved-device-pairing']);
export class BootstrapDenied extends Error {
  constructor(code){super(code);this.name='BootstrapDenied'}
}
const deny=code=>{throw new BootstrapDenied(code)};
export function createBootstrapVerifier({db,resolveSession,verifyStepUp}={}){
  if(typeof db?.connect!=='function'||typeof resolveSession!=='function'||
     typeof verifyStepUp!=='function')deny('SERVER_DEPENDENCIES_REQUIRED');
  return async function verifyBootstrap({mioId}={}){
    if(!MIO.test(mioId||''))deny('INVALID_MIO_ID');
    const session=await resolveSession();
    if(session?.mioId!==mioId||!BROWSER.test(session?.browserId||'')||
       !HASH.test(session?.tokenHash||'')||session?.active!==true)
      deny('SESSION_NOT_VERIFIED');
    const client=await db.connect();
    try {
      const result=await client.query(
        `SELECT mio_id,browser_id,token_hash,status
           FROM mio_browser_links_v204
          WHERE mio_id=$1 AND browser_id=$2 AND token_hash=$3 LIMIT 1`,
        [mioId,session.browserId,session.tokenHash]);
      const row=result.rows?.[0];
      if(result.rowCount!==1||row?.mio_id!==mioId||
         row?.browser_id!==session.browserId||row?.token_hash!==session.tokenHash||
         row?.status!=='active')deny('DEVICE_NOT_APPROVED');
    }finally{client.release()}
    const proof=await verifyStepUp({mioId,browserId:session.browserId,tokenHash:session.tokenHash});
    if(proof?.mioId!==mioId||proof?.browserId!==session.browserId||
       proof?.tokenHash!==session.tokenHash||proof?.userVerified!==true||
       proof?.consumed!==true||!METHODS.has(proof?.method))deny('STEP_UP_REQUIRED');
    return {mioId,userVerified:true,deviceApproved:true,method:proof.method};
  };
}
