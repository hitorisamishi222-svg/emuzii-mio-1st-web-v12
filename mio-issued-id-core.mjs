// Isolated vNext issuer-ID access model. No existing participant, GAS, gacha,
// attendance or production route may consume these privileges before release.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ROOM = Object.freeze({ PUBLIC: 'public', FAN: 'fan', MEMBER: 'member' });
export const RANK = Object.freeze({ FAN: 'fan', MEMBER: 'member' });
const ID = /^MIO-(?:\d{4}|[A-Z0-9]{4}-[A-Z0-9]{4})$/;
const INVITE = /^MIO-ONCE-[a-f0-9]{32}$/;
const THUMBPRINT = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[a-f0-9]{64}$/;

export function requireMioId(masterId) {
 if(typeof masterId !== 'string' || !ID.test(masterId)) throw Error('INVALID_MIO_ID');
 return masterId;
}
export function requireIssuerId(issuerId) {
 if(typeof issuerId !== 'string' || !/^[a-z][a-z0-9_-]{1,31}$/.test(issuerId)) throw Error('INVALID_ISSUER');
 return issuerId;
}
export function requireRank(rank) {
 if(rank !== RANK.FAN && rank !== RANK.MEMBER) throw Error('INVALID_RANK');
 return rank;
}
export function requireDeviceThumbprint(thumbprint) {
 if(typeof thumbprint !== 'string' || !THUMBPRINT.test(thumbprint)) throw Error('INVALID_DEVICE_KEY');
 return thumbprint;
}
export function requireOwner(actor, issuer) {
 if(!actor || actor.role !== 'owner' || typeof actor.userId !== 'string' ||
    !issuer || issuer.active !== true || issuer.owner_user_id !== actor.userId)
  throw Error('ISSUER_OWNER_REQUIRED');
 return true;
}
export function requireRosterProof(proof, masterId) {
 // Only backend-attested exact GAS/roster proof may be supplied here. NEVER a
 // client-provided boolean or a matching nickname.
 if(!proof || proof.trusted !== true || proof.unique !== true || proof.masterId !== masterId)
  throw Error('ROSTER_PROOF_REQUIRED');
 return true;
}
function peppered(value, pepper) {
 if(typeof pepper !== 'string' || pepper.length < 48) throw Error('ACCESS_PEPPER_MISSING');
 return createHmac('sha256', pepper).update(value).digest('hex');
}
export function issueOneTimeCode(pepper) {
 const code = 'MIO-ONCE-'+randomBytes(16).toString('hex');
 return { code, codeHash: peppered('invite:'+code, pepper) };
}
export function invitationHash(code, pepper) {
 if(typeof code !== 'string' || !INVITE.test(code)) throw Error('INVALID_INVITATION');
 return peppered('invite:'+code, pepper);
}
export function newSession(pepper) {
 const token = randomBytes(32).toString('hex');
 return {token, sessionHash:peppered('session:'+token,pepper)};
}
export function sessionHash(token,pepper) {
 if(typeof token !== 'string' || !TOKEN.test(token)) throw Error('INVALID_SESSION');
 return peppered('session:'+token,pepper);
}
export function constantTimeSame(a,b) {
 if(typeof a!=='string'||typeof b!=='string')return false;
 const one=Buffer.from(a),two=Buffer.from(b);
 return one.length===two.length && timingSafeEqual(one,two);
}
export function effectiveRank(account, now = new Date()) {
 if(!account || account.status!=='active') return null;
 const rank=requireRank(account.rank);
 if(rank===RANK.MEMBER && (!account.member_until || new Date(account.member_until).getTime()<=now.getTime())) return RANK.FAN;
 return rank;
}
export function mayEnterRoom(room, rank) {
 if(room===ROOM.PUBLIC)return true;
 if(room===ROOM.FAN)return rank===RANK.FAN||rank===RANK.MEMBER;
 if(room===ROOM.MEMBER)return rank===RANK.MEMBER;
 return false;
}
export function requireDeviceProof(proof, expectedThumbprint) {
 // The caller MUST have verified a fresh signed challenge using the stored,
 // non-extractable device key. Client-supplied thumbprints are not evidence.
 if(!proof || proof.trusted!==true || proof.fresh!==true ||
   proof.keyThumbprint!==expectedThumbprint) throw Error('DEVICE_PROOF_REQUIRED');
 return true;
}
