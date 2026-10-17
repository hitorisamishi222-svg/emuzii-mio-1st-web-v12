// Server-only gallery media capability probe. No write operation is exposed.
// Owner-approved identity and device authorization must be added before uploads can be enabled.
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GETを使用してください'});}
 return res.status(200).json({ok:true,storageConfigured:Boolean(process.env.BLOB_READ_WRITE_TOKEN),publishingEnabled:false,adminAuthEnabled:false,deviceApprovalEnabled:false,passkeyBackendConfigured:Boolean(process.env.GALLERY_DATABASE_URL),passkeyRegistrationPage:'/gallery-passkey-register.html'});
}
