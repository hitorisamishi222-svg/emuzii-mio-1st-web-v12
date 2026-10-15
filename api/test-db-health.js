import {testAuthDeploymentGate} from '../security/mio-test-deployment-gate.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
 const gate=testAuthDeploymentGate(process.env);
 if(!gate.ok)return res.status(503).json({status:'disabled'});
 try{
  const {Pool}=await import('pg');
  const pool=new Pool({connectionString:process.env.MIO_TEST_DATABASE_URL,max:1,connectionTimeoutMillis:5000});
  try{
   const r=await pool.query("SELECT current_database() AS db,count(*)::int AS tables FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'mio_%_v21'");
   const ok=r.rows[0]?.db===gate.databaseName&&r.rows[0]?.tables===5;
   return res.status(ok?200:503).json({status:ok?'ok':'schema_mismatch'});
  }finally{await pool.end()}
 }catch{return res.status(503).json({status:'db_unavailable'})}
}
