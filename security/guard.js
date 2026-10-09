import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const MAX_BODY_BYTES=32*1024;
export function sameOrigin(req, expectedHost){
 const origin=req.headers?.origin;
 const site=req.headers?.['sec-fetch-site'];
 if(site && !['same-origin','none'].includes(site)) return false;
 if(!origin)return site==='same-origin';
 try {const u=new URL(origin);return u.protocol==='https:' && u.host===expectedHost} catch{return false}
}
export function secureJson(req,{maxBytes=MAX_BODY_BYTES}={}){
 const type=String(req.headers?.['content-type']||'').split(';')[0].trim().toLowerCase();
 if(type!=='application/json')return {ok:false,status:415,error:'JSON形式で送信してください'};
 const declared=Number(req.headers?.['content-length']);
 if(Number.isFinite(declared)&&declared>maxBytes)return {ok:false,status:413,error:'送信内容が大きすぎます'};
 let data=req.body;
 try{if(typeof data==='string')data=JSON.parse(data)}catch{return {ok:false,status:400,error:'JSONを確認してください'}}
 if(!data||typeof data!=='object'||Array.isArray(data))return {ok:false,status:400,error:'送信内容を確認してください'};
 if(Buffer.byteLength(JSON.stringify(data),'utf8')>maxBytes)return {ok:false,status:413,error:'送信内容が大きすぎます'};
 return {ok:true,data};
}
export function addSecurityHeaders(res){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Cache-Control','private, no-store');
}
export function safeError(res,status=500){
 return res.status(status).json({ok:false,error:'処理を完了できませんでした。時間をおいてお試しください'});
}
export function tokenDigest(value){return createHash('sha256').update(String(value)).digest('hex')}
export function randomRequestId(){return randomBytes(16).toString('hex')}
export function constantTimeEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
// Caller MUST use shared durable storage, e.g. Redis. Never rely on serverless process memory.
export async function fixedWindowLimit(store,{key,limit,windowSeconds}){
 if(!store||typeof store.incrementWithExpiry!=='function')throw Error('Durable limiter not configured');
 if(!/^[a-z0-9:_-]{1,160}$/i.test(key)||!Number.isInteger(limit)||limit<1||!Number.isInteger(windowSeconds)||windowSeconds<1)throw Error('Invalid rate limit policy');
 const count=await store.incrementWithExpiry(key,windowSeconds);
 return {allowed:count<=limit,remaining:Math.max(0,limit-count),retryAfter:count>limit?windowSeconds:0};
}
