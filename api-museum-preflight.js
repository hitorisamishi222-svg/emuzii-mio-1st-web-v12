// Museum release gate. Read-only SQL metadata; never tests writes or exposes credentials.
import pg from 'pg';
import {sessionAdmin} from './api-museum-exhibits.js';
import {museumSchemaReport,REQUIRED_MUSEUM_SCHEMA,OPTIONAL_ASSET_SCHEMA} from './museum-preflight-core.js';
const {Pool}=pg;
const HOST='emuzii-mio-1st-web-v12.vercel.app';
const fail=(res,status,code)=>res.status(status).json({ok:false,code});
export function createMuseumPreflightHandler(deps={}){
 const PoolClass=deps.PoolClass||Pool;
 const verify=deps.verifyAdmin||sessionAdmin;
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Vary','Cookie');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(res,405,'METHOD_NOT_ALLOWED');}
  if(req.headers.host!==HOST)return fail(res,503,'ADMIN_HOST_UNAVAILABLE');
  if(process.env.MIO_MUSEUM_PREFLIGHT_ENABLED!=='true')return fail(res,503,'PREFLIGHT_CLOSED');
  if(!process.env.GALLERY_DATABASE_URL)return fail(res,503,'DB_NOT_CONFIGURED');
  const pool=new PoolClass({
   connectionString:process.env.GALLERY_DATABASE_URL,
   max:1,connectionTimeoutMillis:4000
  });
  let client;
  try{
   client=await pool.connect();
   const admin=await verify(client,req);
   if(!admin)return fail(res,401,'ADMIN_LOGIN_REQUIRED');
   if(admin.role!=='owner')return fail(res,403,'MUSEUM_OWNER_ONLY');
   // Queries inspect only system metadata. No DDL, DML or writes.
   const identity=await client.query('SELECT current_database() AS db_name');
   const columns=await client.query(
    'SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns '+
    'WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',
    [[...Object.keys(REQUIRED_MUSEUM_SCHEMA),...Object.keys(OPTIONAL_ASSET_SCHEMA)]]
   );
   const constraints=await client.query(
    'SELECT t.relname AS table_name,c.contype,c.convalidated AS validated,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c '+
    'JOIN pg_class t ON t.oid=c.conrelid '+
    'JOIN pg_namespace n ON n.oid=t.relnamespace '+
    "WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) "+
    "AND c.contype IN ('c','f')",
    [...Object.keys(REQUIRED_MUSEUM_SCHEMA)]
   );
   // Explicit owner-confirmed expected endpoint and DB name must BOTH match.
   // Never return either value or the connection string.
   let identityVerified=false;
   try{
    const target=new URL(process.env.GALLERY_DATABASE_URL);
    const expectedHost=process.env.MIO_MUSEUM_EXPECTED_DB_HOST||'';
    const expectedName=process.env.MIO_MUSEUM_EXPECTED_DB_NAME||'';
    identityVerified=Boolean(
     expectedHost&&expectedName&&
     ['postgres:','postgresql:'].includes(target.protocol)&&
     target.hostname.toLowerCase()===expectedHost.toLowerCase()&&
     identity.rows?.[0]?.db_name===expectedName
    );
   }catch{}
   const report=museumSchemaReport({
    columns:columns.rows,constraints:constraints.rows,identityVerified
   });
   return res.status(200).json({ok:true,...report,mode:'read_only',
    note:'This checks table structure and an owner-confirmed DB identity. It never enables publication or saves an exhibit.'
   });
  }catch(e){
   console.error('museum preflight:',e?.code||'error');
   return fail(res,503,'PREFLIGHT_UNAVAILABLE');
  }finally{
   client?.release();
   await pool.end().catch(()=>{});
  }
 };
}
export default createMuseumPreflightHandler();
