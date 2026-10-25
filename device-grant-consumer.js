import {createHmac,timingSafeEqual} from 'node:crypto';
import {verifyDeviceGrant} from './device-grant-verifier.js';

/**
 * In-memory test harness for one-time grant consumption.
 * Production MUST use an atomic durable store; do not deploy this as a
 * production replay-prevention mechanism in a serverless environment.
 */
export function createGrantTestStore() {
  const consumed=new Set();
  return {
    consume(nonce) {
      if(consumed.has(nonce))return false;
      consumed.add(nonce);
      return true;
    }
  };
}
export async function validateAndConsumeDeviceGrant({grant,signature,secret,store,now}={}) {
  const verified=verifyDeviceGrant({grant,signature,secret,now});
  if(!verified)return {ok:false,reason:'INVALID_GRANT'};
  if(!store||typeof store.consume!=='function')return {ok:false,reason:'DURABLE_STORE_REQUIRED'};
  const consumed=await store.consume(verified.nonce,verified.expiresAt);
  if(consumed!==true)return {ok:false,reason:'GRANT_ALREADY_USED'};
  return {ok:true,verified};
}
