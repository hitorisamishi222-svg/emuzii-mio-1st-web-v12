// MIO MUSEUM - UNROUTED, staging-only Vercel/Neon connection TARGET comparison.
// This module never opens a DB connection, retrieves a secret, or authorizes a write.
// The server/operator must independently obtain provider metadata and confirm its
// provenance. A browser-supplied "verified" flag is never sufficient evidence.
// Do NOT use this result as a production release or database-write permission.
const ID=/^[a-z0-9-]{8,80}$/;
const SHA=/^[a-f0-9]{40}$/i;
const PROJECT=/^prj_[A-Za-z0-9]+$/;
const HOST=/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/;
const NAME=/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const BRANCH='feature/mio-v2-integration-mainbaseline-20261102';
const keys=['provider_project','provider_branch','nonproduction_branch',
 'provider_endpoint','database','role','vercel_project','preview_branch',
 'candidate_sha','url_host','url_database','url_role','url_transport'];
const freeze=Object.freeze;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const safeString=x=>typeof x==='string'&&x.length>0;
const parseConnection=x=>{
 if(!safeString(x)||x.length>8192)return null;
 try{
  const url=new URL(x);
  const sql=url.protocol==='postgres:'||url.protocol==='postgresql:';
  const options=[...url.searchParams.keys()];
  // Reject options capable of bypassing an exact endpoint comparison.
  const dangerous=options.some(k=>['host','hostaddr','service','options','dbname','user','password'].includes(k.toLowerCase()));
  const ssl=url.searchParams.get('sslmode');
  const db=decodeURIComponent(url.pathname.slice(1));
  return {
   host:url.hostname.toLowerCase(),
   database:db,role:decodeURIComponent(url.username),
   transport:sql&&!url.hash&&!dangerous&&
    (url.port===''||url.port==='5432')&&
    (ssl==='require'||ssl==='verify-full')
  };
 }catch{return null}
};
// All arguments are confidential SERVER-SIDE inputs. Never serialize them.
// "matchesMetadata" is a comparison only; actual provider provenance,
// a restorable backup, schema, rights, and human signoff remain separate.
export function assessMuseumNeonBindingStage({
 connectionString,provider,deployment,expected
}={}){
 const p=record(provider)?provider:{};
 const d=record(deployment)?deployment:{};
 const e=record(expected)?expected:{};
 const u=parseConnection(connectionString);
 const checks={
  provider_project:ID.test(p.projectId||'')&&p.projectId===e.neonProjectId,
  provider_branch:ID.test(p.branchId||'')&&p.branchId===e.neonBranchId,
  nonproduction_branch:p.isPrimary===false&&p.branchName!=='main'&&
   p.branchId!==e.productionBranchId,
  provider_endpoint:HOST.test(p.endpointHost||'')&&
   safeString(e.productionEndpointHost)&&p.endpointHost!==e.productionEndpointHost,
  database:NAME.test(p.databaseName||''),
  role:NAME.test(p.roleName||''),
  vercel_project:PROJECT.test(d.projectId||'')&&d.projectId===e.vercelProjectId,
  preview_branch:d.target==='preview'&&d.gitBranch===BRANCH,
  candidate_sha:SHA.test(d.gitSha||'')&&d.gitSha===e.candidateSha,
  url_host:!!u&&u.host===p.endpointHost,
  url_database:!!u&&u.database===p.databaseName,
  url_role:!!u&&u.role===p.roleName,
  url_transport:!!u&&u.transport===true
 };
 const failed=freeze(keys.filter(k=>checks[k]!==true));
 return freeze({
  // In particular: this does not establish that metadata was genuinely
  // retrieved from Vercel/Neon, nor that any schema migration is approved.
  matchesMetadata:failed.length===0,
  checks:freeze(Object.fromEntries(keys.map(k=>[k,checks[k]===true]))),
  failed,
  canConnectToProduction:false,canWrite:false,canDeploy:false,
  didReadSecrets:false,didModifyDatabase:false
 });
}
