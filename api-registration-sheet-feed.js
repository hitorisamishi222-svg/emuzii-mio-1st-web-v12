// Read-only CSV feed for the organizer's Google Sheet import.
// Protected by an independent high-entropy bearer token; contains NO session secrets.
import {createHash,timingSafeEqual} from 'node:crypto';
import pg from 'pg';
const {Pool}=pg;let pool;
function auth(received,expected){
 if(!expected||expected.length<48||!received)return false;
 const a=createHash('sha256').update(received).digest(),b=createHash('sha256').update(expected).digest();
 return timingSafeEqual(a,b);
}
function csvCell(value){
 let text=String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').trim();
 if(/^[=+\-@]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET')return res.status(405).end();
 if(process.env.VERCEL_ENV!=='production')return res.status(404).end();
 if(!auth(String(req.query?.token||''),process.env.MIO_SHEET_SYNC_TOKEN))return res.status(404).end();
 if(!process.env.MIO_REGISTRATION_DATABASE_URL)return res.status(503).end();
 try{
  if(!pool)pool=new Pool({connectionString:process.env.MIO_REGISTRATION_DATABASE_URL,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000});
  const {rows}=await pool.query(
   'SELECT created_at,name,browser_id,status FROM mio_registration_v2 ORDER BY created_at ASC LIMIT 5000'
  );
  const out=[['登録日時 (UTC)','ColorSing名','ブラウザID','基本利用','管理状態']];
  for(const r of rows){
   out.push([new Date(r.created_at).toISOString(),r.name,r.browser_id,
    r.status==='却下'?'利用不可':'フォーム・ギャラリー利用可',r.status]);
  }
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  return res.status(200).send('\ufeff'+out.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n');
 }catch{return res.status(503).end()}
}
