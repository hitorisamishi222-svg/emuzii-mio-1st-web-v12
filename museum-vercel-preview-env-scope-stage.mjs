// MIO museum: unmounted, metadata-only Vercel Preview env-scope preflight.
// Never request decrypted secrets, fetch provider APIs, connect to Neon, or
// treat the presence of an env name as proof of the underlying database.
// Caller must independently establish the metadata came from the FULL provider
// inventory; a hand-built list cannot certify real deployed configuration.
const TARGET='feature/mio-v2-integration-mainbaseline-20261102';
// Dedicated museum key: never reuse or reconfigure the shared gallery URL.
const KEY='MIO_MUSEUM_GALLERY_DATABASE_URL';
const SHA=/^[a-f0-9]{40}$/i;
const PROJECT=/^prj_[A-Za-z0-9]+$/;
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const owns=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const FIELDS=['inventory_shape','project_identity','preview_identity',
 'candidate_commit','valid_gallery_metadata','one_branch_override',
 'no_inherited_preview','preview_only_scope','museum_key_exclusive_branch'];
const frozen=Object.freeze;
export function assessMuseumPreviewEnvScopeStage({variables,deployment,expected}={}){
 const d=isRecord(deployment)?deployment:{};
 const e=isRecord(expected)?expected:{};
 const shape=Array.isArray(variables)&&variables.length<=1000&&
  variables.every(x=>isRecord(x)&&typeof x.key==='string'&&
   Array.isArray(x.target)&&x.target.every(t=>typeof t==='string'));
 const gallery=shape?variables.filter(x=>x.key===KEY):[];
 const preview=gallery.filter(x=>x.target.includes('preview'));
 const inherited=preview.filter(x=>!owns(x,'gitBranch')||!x.gitBranch);
 const matching=preview.filter(x=>x.gitBranch===TARGET);
 const checks={
  inventory_shape:shape,
  project_identity:PROJECT.test(d.projectId||'')&&d.projectId===e.vercelProjectId,
  preview_identity:d.target==='preview'&&d.gitBranch===TARGET,
  candidate_commit:SHA.test(d.gitSha||'')&&d.gitSha===e.candidateSha,
  valid_gallery_metadata:shape&&gallery.length>0&&gallery.every(x=>
   typeof x.id==='string'&&x.id.length>0&&
   ['encrypted','sensitive'].includes(x.type)&&
   x.target.length>0&&x.target.every(t=>
    ['preview','production','development'].includes(t))&&
   (x.gitBranch===undefined||typeof x.gitBranch==='string')),
  one_branch_override:matching.length===1,
  // This applies ONLY to the museum key; legacy gallery Preview settings
  // are left intact for their existing routes. A newly
  // created Preview branch could silently inherit the dangerous DB URL.
  no_inherited_preview:inherited.length===0,
  preview_only_scope:matching.length===1&&
   matching[0].target.length===1&&matching[0].target[0]==='preview',
  // This key is reserved for the museum Draft only. A Production,
  // Development, another Preview branch or mixed-target entry is unsafe.
  // Keep the unrelated legacy GALLERY_DATABASE_URL completely untouched.
  museum_key_exclusive_branch:gallery.length===1&&matching.length===1&&
   gallery[0]===matching[0]
 };
 const failed=frozen(FIELDS.filter(k=>checks[k]!==true));
 return frozen({
  // Metadata consistency ONLY. Full inventory provenance, decrypted endpoint
  // comparison, backup restoration and owner signoff remain independently due.
  metadataConsistent:failed.length===0,
  checks:frozen(Object.fromEntries(FIELDS.map(k=>[k,checks[k]===true]))),
  failed,
  bindingVerified:false,canWrite:false,canDeploy:false,
  didFetchSecrets:false,didConnectDatabase:false,didModifyEnvironment:false
 });
}
