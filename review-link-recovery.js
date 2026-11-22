import {bridge,sessionCookie} from './bridge.js';
import {reviewLinkStore} from './review-link-store.js';
import {releaseOK,ownerReleaseOperation,finalizeReviewLink} from './review-link-core.mjs';
import {historicalApprovalRelease} from './historical-approval-core.mjs';
export async function recoverStagedReview({req,res,config=process.env}){
 const general=releaseOK(config),ownerOperation=ownerReleaseOperation(config);
 if((!general&&!ownerOperation)||config.MIO_AUTO_RECOVER_VERIFIED_TWO!=='enabled'||
 typeof config.APPS_SCRIPT_SECRET!=='string'||config.APPS_SCRIPT_SECRET.length<32)return {status:'disabled'};
 try{
  const store=reviewLinkStore();
  if(!historicalApprovalRelease(config))delete store.getHistorical;
  const r=await finalizeReviewLink({cookie:req.headers.cookie,lightSecret:config.MIO_LIGHT_SESSION_SECRET,
   store,callGAS:bridge,ownerOperation:general?null:ownerOperation});
  if(r.status==='recovered'){
   res.setHeader('Set-Cookie',sessionCookie(r.session.id,r.session.token,config.APPS_SCRIPT_SECRET));
   return {status:'recovered',data:r.data};
  }
  return r;
 }catch{return {status:'pending-safe-verification'}}
}
