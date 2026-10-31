/**
 * Phase 2E: candidate-only sending from the EXISTING Apps Script project.
 * NOT installed, NOT deployed. No new GAS project or spreadsheet.
 *
 * Proposed dispatcher in EXISTING doPost AFTER BRIDGE_SECRET check and
 * inside its ScriptLock, BEFORE participantId/tokenHash validation:
 * if(d.action==='eventEmailOtpSend')
 *   return json_(mioEventEmailOtpSend_(d));
 *
 * GAS script property MIO_EVENT_EMAIL_OTP_GAS_ENABLED must be exactly
 * reviewed-event-email-send-20261101 before any email is sent.
 * Keep existing doPost routing and two-browser allowlist untouched.
 */
function mioEventEmailOtpSend_(d){
 var flag=PropertiesService.getScriptProperties().getProperty('MIO_EVENT_EMAIL_OTP_GAS_ENABLED');
 if(flag!=='reviewed-event-email-send-20261101')
  return {ok:false,sent:false,error:'email sender disabled'};
 var email=String(d.email||'').trim().toLowerCase();
 var code=String(d.code||''),challengeId=String(d.challengeId||'');
 // No recipients list, redirect, header injection or arbitrary email content.
 if(email.length<5||email.length>254||
   !/^[a-z0-9.!#$%&'*+\/?=^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)||
   email.indexOf('..')!==-1||!/^[0-9]{6}$/.test(code)||
   !/^[a-f0-9-]{36}$/i.test(challengeId))
   return {ok:false,sent:false,error:'invalid email challenge'};
 if(MailApp.getRemainingDailyQuota()<1)
   return {ok:false,sent:false,error:'daily email quota reached'};
 var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,email);
 var key='mio-event-otp-mail-'+Utilities.base64EncodeWebSafe(bytes).slice(0,36);
 var cache=CacheService.getScriptCache();
 if(cache.get(key))return {ok:false,sent:false,error:'mail request too frequent'};
 MailApp.sendEmail(email,'翠央イベント 認証コード',
  'イベントに参加するための確認コード：'+code+'\n\n有効期限は10分です。\n身に覚えがない場合は、このメールを無視してください。\nこのコードを他人に伝えないでください。');
 cache.put(key,'sent',90);
 return {ok:true,sent:true};
}
