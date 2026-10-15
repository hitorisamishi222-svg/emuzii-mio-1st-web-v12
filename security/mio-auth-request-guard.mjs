// Development-only HTTP request guard. Configure trustedOrigin to exact HTTPS site.
// Production must also provide shared durable rate limiting and audit logging.
export function checkAuthRequest(request,{trustedOrigin,maxBodyBytes=4096}={}){
 if(typeof trustedOrigin!=='string'||!/^https:\/\/[^/]+$/.test(trustedOrigin))throw Error('trusted HTTPS origin required');
 const method=String(request?.method||'').toUpperCase();
 const headers=request?.headers||{};
 const get=(name)=>String(headers[name]??headers[name.toLowerCase()]??'');
 if(method!=='POST')return {ok:false,status:405,error:'method_not_allowed'};
 const origin=get('origin');
 if(origin!==trustedOrigin)return {ok:false,status:403,error:'origin_denied'};
 const fetchSite=get('sec-fetch-site').toLowerCase();
 if(fetchSite&&fetchSite!=='same-origin')return {ok:false,status:403,error:'cross_site_denied'};
 const contentType=get('content-type').toLowerCase();
 if(!/^application\/json(?:\s*;|$)/.test(contentType))return {ok:false,status:415,error:'unsupported_media_type'};
 const size=Number(get('content-length'));
 if(get('content-length')&&(!Number.isSafeInteger(size)||size<0||size>maxBodyBytes))return {ok:false,status:413,error:'payload_too_large'};
 return {ok:true};
}
