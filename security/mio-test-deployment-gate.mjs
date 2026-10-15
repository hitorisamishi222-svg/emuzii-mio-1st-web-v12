// Shared preflight for a future TEST-only auth API. Fails closed by default.
// Do not use the live GAS/participant database in a development preview.
export function testAuthDeploymentGate(env={}) {
 if(env.MIO_TEST_AUTH_ENABLED!=='true')return {ok:false,reason:'test_auth_disabled'};
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='release/v2-next-integrated-replica')
  return {ok:false,reason:'preview_branch_required'};
 if(typeof env.MIO_TEST_DATABASE_URL!=='string'||!env.MIO_TEST_DATABASE_URL)
  return {ok:false,reason:'isolated_database_required'};
 let url;
 try{url=new URL(env.MIO_TEST_DATABASE_URL)}catch{return {ok:false,reason:'invalid_database_url'}}
 const db=decodeURIComponent(url.pathname.slice(1));
 if(!['postgres:','postgresql:'].includes(url.protocol)||!/^mio_(?:ci_|dev_)?test(?:_[a-z0-9_]+)?$/.test(db)
  ||!url.hostname||!url.username||!url.password)
  return {ok:false,reason:'isolated_database_required'};
 if(typeof env.MIO_TEST_ORIGIN!=='string')return {ok:false,reason:'test_origin_required'};
 let origin;
 try{origin=new URL(env.MIO_TEST_ORIGIN)}catch{return {ok:false,reason:'test_origin_required'}}
 if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||!origin.hostname.endsWith('.vercel.app')
  ||!origin.hostname.startsWith('emuzii-mio-1st-web-v12-'))
  return {ok:false,reason:'test_origin_required'};
 return {ok:true,origin:origin.origin,databaseName:db};
}
