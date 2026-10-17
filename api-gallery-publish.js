// Gallery publishing is disabled until owner-approved identities, device approval and durable storage are configured.
// Participant session cookies do not grant administrator privileges.
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Allow','POST');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'POSTを使用してください'});
 const origin=req.headers.origin;
 if(origin){try{const u=new URL(origin);if(u.protocol!=='https:'||u.host!==req.headers.host)throw Error('origin')}catch{return res.status(403).json({ok:false,error:'別サイトからの操作はできません'})}}
 return res.status(503).json({ok:false,code:'GALLERY_ADMIN_NOT_CONFIGURED',error:'管理者の本人確認・端末承認・保存先の準備が完了するまで登録できません'});
}
