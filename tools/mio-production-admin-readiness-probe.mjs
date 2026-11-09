// Public production availability probe. Never authenticates, writes, logs
// user data, or sends an administration code. Use from a networked CI runner.
// HTTP 403 means the public read endpoint reached its authentication gate,
// NOT that the real GAS read/write pipeline works.
const ORIGIN='https://emuzii-mio-1st-web-v12.vercel.app';
const cases=[
 {key:'gate_switch',path:'/api/gacha-web-gate'},
 {key:'admin_roster',path:'/api/gacha-admin-ops'}
];
for(const c of cases){
 let state='NETWORK_ERROR',status=0;
 try{
  const resp=await fetch(ORIGIN+c.path,{
   method:'POST',
   headers:{'Origin':ORIGIN,'Content-Type':'application/json'},
   body:JSON.stringify({action:'read'}),
   redirect:'error',
   signal:AbortSignal.timeout(12000)
  });
  status=resp.status;
  // Never inspect or print private data, even if backend mistakenly returns it.
  if(status===403)state='AUTHENTICATION_GATE_REACHED';
  else if(status===503)state='DISABLED_OR_BACKEND_UNCONFIGURED';
  else if(status===405)state='METHOD_NOT_ACCEPTED';
  else if(status===200)state='UNAUTHENTICATED_READ_SECURITY_REVIEW_REQUIRED';
  else state='OTHER_HTTP_STATUS';
 }catch{}
 process.stdout.write(JSON.stringify({case:c.key,httpStatus:status,state,
   authenticated:false,adminReadConfirmed:false,mutationAllowed:false})+'\n');
}
