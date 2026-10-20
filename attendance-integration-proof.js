// Independent, read-only approval proof. Neither a ColorSing name nor a
// matching IP/browser alone can grant attendance privileges.
// GAS must explicitly attest both the linked MIO participant and attendance row.
export function verifyAttendanceIntegration(light,legacy,browserId){
 if(!/^MIO-W-[a-f0-9]{24}$/.test(String(browserId||'')))return false;
 if(!light||light.participantId!==browserId||
    light.pendingReview!==false||light.status!=='承認済み'||
    light.attendanceGrantVerified!==true)return false;
 const mioId=light.integratedParticipantId;
 if(typeof mioId!=='string'||!/^MIO-[0-9]{4}$/.test(mioId))return false;
 if(!legacy||legacy.participantId!==browserId||
    legacy.status!=='承認済み'||legacy.name!==light.name||
    legacy.integratedParticipantId!==mioId||
    legacy.attendanceLinked!==true)return false;
 if(!legacy.progress||!Array.isArray(legacy.progress.attendanceConfirmedDays)||
    !Array.isArray(legacy.progress.attendanceLockedDays))return false;
 return true;
}
