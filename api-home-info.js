import {prepare,bridge} from './bridge.js';

export default async function handler(req,res){
  const cfg=prepare(req,res);
  if(!cfg)return;
  try{
    const data=await bridge('homeInfo',{});
    const notices=Array.isArray(data.notices)?data.notices:[];
    const schedules=Array.isArray(data.schedules)?data.schedules:[];
    res.setHeader('Cache-Control','public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ok:true,serverTime:data.serverTime||null,notices,schedules});
  }catch(error){
    return res.status(502).json({ok:false,error:'お知らせ・配信予定を取得できませんでした'});
  }
}
